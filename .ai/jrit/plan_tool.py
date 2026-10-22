#!/usr/bin/env python3
"""Chain kit plan tool: find the branch plan, gate its structure, run its
acceptance checks, and enforce its ownership lists.

Stdlib only, deterministic, run from the repo root. Exit 0 = clean.
Fenced code blocks never count as plan structure; their only role is to
carry an acceptance command's body.

An ownership span written path:lines (loop-plan's own task template writes
path:123-145) owns the path. run-checks reruns a failing check at its task's
own commit when a base is known; a pass there is reported MOVED, not FAIL, and
recorded in the git-dir file jrit-chain-moved (one "<id> <sha12>" per line).
"""
import argparse
import fnmatch
import os
import re
import subprocess
import sys

TASK_RE = re.compile(r"^(#{2,3}) Task (\d+[a-z]?):\s*(.+)$")
HEADING_RE = re.compile(r"^(#{1,6})\s")
FENCE_RE = re.compile(r"^(`{3,}|~{3,})")
DEPENDS_RE = re.compile(r"^Depends on:\s*(.+)$")
ACCEPT_RE = re.compile(r"^\*\*Acceptance check:\*\*(.*)$")
BULLET_RE = re.compile(r"^\s*- ")
SPAN_RE = re.compile(r"`([^`\n]+)`")
RUNSHAPE_RE = re.compile(r"^##\s+Run shape\s*$")
TASK_CELL_RE = re.compile(r"^(?:Task\s+|T)(\d+[a-z]?)(?:\s|$)")
DEP_ID_RE = re.compile(r"Task\s+(\d+[a-z]?)")
UNFAILABLE_TAIL_RE = re.compile(r"(\|\||;)\s*(true|:|exit(\s+0)?)\s*$")
SEGMENT_RE = re.compile(r"&&|\|\||;|\||\n")
FILES_HEADER = "**Files (exclusive ownership):**"
LINES_RE = re.compile(r":\d[\d,-]*$")
BASE_KEY = "jrit-chain-base"
MOVED_KEY = "jrit-chain-moved"
NO_BASE_MSG = "no base: pass --base or run preflight first"
NEVER_OWNED_MSG = "(the chain kit and docs/loop/ are never plan-owned)"
MARKER = "[executed-check]"


def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def git_out(args):
    r = subprocess.run(["git"] + args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit(1)
    return r.stdout


def merge_base(ref):
    r = subprocess.run(["git", "merge-base", "HEAD", ref],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit(1)
    return r.stdout.strip()


def recorded_base():
    """The ref preflight wrote into the git dir, or None."""
    path = git_out(["rev-parse", "--git-path", BASE_KEY]).strip()
    if not os.path.isabs(path):
        path = os.path.join(os.getcwd(), path)
    if not os.path.isfile(path):
        return None
    return read_file(path).strip() or None


def fence_map(lines):
    """inside[i] is True when lines[i] sits inside a fenced code block."""
    inside = [False] * len(lines)
    char, count = "", 0
    for i, line in enumerate(lines):
        if char:
            if re.fullmatch(re.escape(char) + "{%d,}[ \t]*" % count, line):
                char = ""
            else:
                inside[i] = True
        else:
            m = FENCE_RE.match(line)
            if m:
                char, count = m.group(1)[0], len(m.group(1))
    return inside


def parse_tasks(lines, inside):
    """Every task heading outside fences, with its section extent."""
    tasks = []
    for i, line in enumerate(lines):
        if inside[i]:
            continue
        m = TASK_RE.match(line)
        if not m:
            continue
        level = len(m.group(1))
        end = len(lines)
        for j in range(i + 1, len(lines)):
            if inside[j]:
                continue
            h = HEADING_RE.match(lines[j])
            if TASK_RE.match(lines[j]) or (h and len(h.group(1)) <= level):
                end = j
                break
        tasks.append({"id": m.group(2), "start": i, "end": end})
    return tasks


def analyze(text):
    """Parse a plan into tasks carrying depends, acceptance, command, bullets."""
    lines = text.split("\n")
    inside = fence_map(lines)
    tasks = parse_tasks(lines, inside)
    for t in tasks:
        t["depends"] = None
        t["acceptance"] = None
        acc_idx = None
        for j in range(t["start"] + 1, t["end"]):
            if inside[j]:
                continue
            m = DEPENDS_RE.match(lines[j])
            if m and t["depends"] is None:
                t["depends"] = m.group(1)
            m = ACCEPT_RE.match(lines[j])
            if m and t["acceptance"] is None:
                t["acceptance"] = m.group(1)
                acc_idx = j
        t["command"] = (extract_command(lines, inside, acc_idx,
                                        t["acceptance"], t["end"])
                        if acc_idx is not None else None)
        t["bullets"] = file_bullets(lines, inside, t)
    return lines, inside, tasks


def extract_command(lines, inside, acc_idx, rest, end):
    """First backtick span other than the marker, else the next fence body."""
    if rest is not None:
        for span in SPAN_RE.findall(rest):
            if span != MARKER:
                return span
    for j in range(acc_idx + 1, end):
        if not inside[j] and FENCE_RE.match(lines[j]):
            body = []
            k = j + 1
            while k < end and inside[k]:
                body.append(lines[k])
                k += 1
            return "\n".join(body)
    return None


def file_bullets(lines, inside, task):
    """Bullet lines directly after the Files header, inside the section."""
    for j in range(task["start"] + 1, task["end"]):
        if inside[j]:
            continue
        if FILES_HEADER not in lines[j]:
            continue
        bullets = []
        for k in range(j + 1, task["end"]):
            line = lines[k]
            if BULLET_RE.match(line):
                bullets.append(line)
            elif not line.startswith((" ", "\t")):
                break
        return bullets
    return []


def unfailable(command):
    """P11: a command that cannot fail is no acceptance check."""
    c = command.strip()
    if not c or c in ("true", ":", "exit 0", "/bin/true"):
        return True
    if UNFAILABLE_TAIL_RE.search(c):
        return True
    words = set()
    for seg in SEGMENT_RE.split(c):
        seg = seg.strip()
        if not seg:
            return False
        words.add(seg.split()[0])
    return words <= {"echo", "printf", "true", ":"}


def create_only(task):
    bullets = task["bullets"]
    return bool(bullets) and all(
        re.match(r"^\s*-\s*Create\b", b) for b in bullets)


def structure_problems(tasks):
    problems = []
    if not tasks:
        return ["no tasks found"]
    known = {t["id"] for t in tasks}
    seen = set()
    for t in tasks:
        if t["id"] in seen:
            problems.append("duplicate Task {}".format(t["id"]))
        seen.add(t["id"])
        if t["depends"] is None:
            problems.append("Task {}: no Depends on line".format(t["id"]))
        elif t["depends"].strip() != "none":
            for dep in DEP_ID_RE.findall(t["depends"]):
                if dep not in known or dep == t["id"]:
                    problems.append(
                        "Task {}: depends on unknown Task {}".format(
                            t["id"], dep))
        if t["acceptance"] is None:
            problems.append("Task {}: no Acceptance check line".format(t["id"]))
        else:
            if not t["command"]:
                problems.append(
                    "Task {}: acceptance check has no command".format(t["id"]))
            if MARKER not in t["acceptance"]:
                problems.append(
                    "Task {}: acceptance check is not marked {}".format(
                        t["id"], MARKER))
            elif t["command"] and unfailable(t["command"]):
                problems.append(
                    "Task {}: acceptance check cannot fail: {}".format(
                        t["id"], t["command"]))
    return problems


def human_ids(lines, inside):
    """Task ids whose Run shape row is human-shaped."""
    ids = []
    start = None
    for i, line in enumerate(lines):
        if not inside[i] and RUNSHAPE_RE.match(line):
            start = i
            break
    if start is None:
        return ids
    header = None
    for j in range(start + 1, len(lines)):
        if not inside[j] and HEADING_RE.match(lines[j]):
            break
        if inside[j] or not lines[j].startswith("|"):
            continue
        cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
        if header is None:
            header = cells
            continue
        task_i = header.index("Task") if "Task" in header else -1
        shape_i = header.index("Shape") if "Shape" in header else -1
        if task_i < 0 or shape_i < 0 or task_i >= len(cells) or shape_i >= len(cells):
            continue
        m = TASK_CELL_RE.match(cells[task_i])
        if m and cells[shape_i] == "human":
            ids.append(m.group(1))
    return ids


def run_at_base(command, mb):
    """Run a command in a throwaway worktree at mb; None on timeout."""
    worktree_seq = run_at_base.seq = getattr(run_at_base, "seq", 0) + 1
    path = os.path.join(os.environ.get("TMPDIR", "/tmp"),
                        "jrit-plan-tool-{}-{}".format(os.getpid(), worktree_seq))
    git_out(["worktree", "add", "--detach", path, mb])
    try:
        try:
            p = subprocess.run(["bash", "-c", command], cwd=path,
                               capture_output=True, text=True, timeout=300)
            return p.returncode
        except subprocess.TimeoutExpired:
            return None
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", path],
                       capture_output=True, text=True)


def pointer_home(key, default):
    path = os.path.join("docs", "loop", "pointer.md")
    if os.path.isfile(path):
        for line in read_file(path).splitlines():
            m = re.match(r"^{}:\s*(\S+)".format(re.escape(key)), line)
            if m:
                return m.group(1)
    return default


def owned_path(span, top):
    """The repo-relative path an ownership span owns, or None."""
    if " " in span:
        return None
    if span.startswith(top + "/"):
        span = span[len(top) + 1:]
    elif span[:1] in ("/", "~", "$"):
        return None
    return LINES_RE.sub("", span)


def own_commit(task, mb):
    """Newest first-parent commit after mb touching a path the task owns."""
    top = git_out(["rev-parse", "--show-toplevel"]).strip()
    paths = [owned_path(span, top) for bullet in task["bullets"]
             for span in SPAN_RE.findall(bullet)]
    paths = [p for p in paths if p]
    if not paths:
        return None
    out = git_out(["log", "--first-parent", "--format=%H", "-1",
                   "{}..HEAD".format(mb), "--"] + paths)
    return out.strip() or None


def allowed(path, entry):
    if entry.endswith("/"):
        return path == entry[:-1] or path.startswith(entry)
    if any(c in entry for c in "*?["):
        return fnmatch.fnmatch(path, entry)
    return path == entry


def cmd_find_plan(args):
    base = args.base or recorded_base()
    if not base:
        print(NO_BASE_MSG)
        return 1
    mb = merge_base(base)
    out = git_out(["log", "--format=", "--name-only", "--diff-filter=A",
                   "{}..HEAD".format(mb), "--", "docs/plans/*-plan.md"])
    for line in out.splitlines():
        line = line.strip()
        if (line.startswith("docs/plans/") and line.endswith("-plan.md")
                and not line.endswith("_loop.md")):
            print(line)
            return 0
    print("no plan added on this branch since {} (merge base {})".format(
        base, mb[:12]))
    return 1


def cmd_check(args):
    lines, inside, tasks = analyze(read_file(args.plan))
    problems = ["plan gate: {}".format(p) for p in structure_problems(tasks)]
    base = args.base or recorded_base()
    if not base:
        print("note: no base, merge-base checks skipped")
    if not problems and base:
        mb = merge_base(base)
        for t in tasks:
            if not create_only(t) or not t["command"]:
                continue
            if run_at_base(t["command"], mb) == 0:
                problems.append(
                    "plan gate: Task {}: acceptance check passes before "
                    "the task's files exist (at {}): {}".format(
                        t["id"], mb[:12], t["command"]))
    for p in problems:
        print(p)
    if problems:
        return 1
    print("ok: {} tasks".format(len(tasks)))
    return 0


def cmd_run_checks(args):
    lines, inside, tasks = analyze(read_file(args.plan))
    humans = set(human_ids(lines, inside))
    base = args.base or recorded_base()
    mb = merge_base(base) if base else None
    moved = []
    ran = failed = 0
    for t in tasks:
        if t["id"] in humans:
            print("SKIP task {}: human".format(t["id"]))
            continue
        ran += 1
        output = ""
        try:
            p = subprocess.run(["bash", "-c", t["command"] or ""],
                               capture_output=True, text=True, timeout=1800)
            output = p.stdout + p.stderr
            if p.returncode == 0:
                print("PASS task {}".format(t["id"]))
            else:
                sha = own_commit(t, mb) if mb else None
                if sha and run_at_base(t["command"] or "", sha) == 0:
                    moved.append("{} {}".format(t["id"], sha[:12]))
                    print("MOVED task {}: fails on the finished tree, passes "
                          "at its own commit {}".format(t["id"], sha[:12]))
                    continue
                failed += 1
                code = p.returncode if p.returncode >= 0 else 128 - p.returncode
                print("FAIL task {}: exit {}".format(t["id"], code))
        except subprocess.TimeoutExpired:
            failed += 1
            print("FAIL task {}: timed out after 1800 s".format(t["id"]))
        for line in output.splitlines()[-40:]:
            print("  {}".format(line))
    path = git_out(["rev-parse", "--git-path", MOVED_KEY]).strip()
    with open(path, "w", encoding="utf-8") as f:
        f.write("".join(m + "\n" for m in moved))
    if failed:
        print("drive gate: {} of {} acceptance checks failed".format(failed, ran))
        return 1
    return 0


def cmd_human_tasks(args):
    lines, inside, _ = analyze(read_file(args.plan))
    for tid in human_ids(lines, inside):
        print(tid)
    return 0


def cmd_ownership(args):
    base = args.base or recorded_base()
    if not base:
        print(NO_BASE_MSG)
        return 1
    mb = merge_base(base)
    changed = [l.strip() for l in
               git_out(["diff", "--name-only", "{}...HEAD".format(mb)]).splitlines()
               if l.strip()]
    _, _, tasks = analyze(read_file(args.plan))
    top = git_out(["rev-parse", "--show-toplevel"]).strip()
    entries = ["docs/plans/",
               pointer_home("reviews-home", "docs/reviews/"),
               pointer_home("handoffs-home", "docs/handoffs/")]
    for t in tasks:
        for bullet in t["bullets"]:
            for span in SPAN_RE.findall(bullet):
                entry = owned_path(span, top)
                if entry:
                    entries.append(entry)
    outside = 0
    for path in changed:
        if path.startswith(".ai/") or path.startswith("docs/loop/"):
            print("outside ownership: {} {}".format(path, NEVER_OWNED_MSG))
            outside += 1
        elif not any(allowed(path, e) for e in entries):
            print("outside ownership: {}".format(path))
            outside += 1
    if outside:
        return 1
    print("ok: {} changed files inside ownership".format(len(changed)))
    return 0


def main(argv):
    ap = argparse.ArgumentParser(
        description="Find, check, run, and enforce a jrit chain plan.")
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("find-plan", help="newest plan added on this branch")
    p.add_argument("--base")
    p.set_defaults(func=cmd_find_plan)

    p = sub.add_parser("check", help="gate the plan's structure")
    p.add_argument("plan")
    p.add_argument("--base")
    p.set_defaults(func=cmd_check)

    p = sub.add_parser("run-checks", help="run every acceptance check")
    p.add_argument("plan")
    p.add_argument("--base")
    p.set_defaults(func=cmd_run_checks)

    p = sub.add_parser("human-tasks", help="ids of human-shaped tasks")
    p.add_argument("plan")
    p.set_defaults(func=cmd_human_tasks)

    p = sub.add_parser("ownership", help="diff the branch against the lists")
    p.add_argument("plan")
    p.add_argument("--base")
    p.set_defaults(func=cmd_ownership)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
