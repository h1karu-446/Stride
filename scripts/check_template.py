#!/usr/bin/env python3
"""Check template files, simple local Markdown links and generated skill copies."""
import os
from pathlib import Path
import re
import subprocess
import sys
from sync_skills import DESTINATIONS, discover_skills, sync

REQUIRED = (
    'README.md', 'AGENTS.md', 'CLAUDE.md', 'TEMPLATE_VERSION',
    '.claude/agents/reviewer.md',
    'docs/development-workflow.md', 'docs/project-context.md',
    'docs/ai-dev-starter-guide.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/ISSUE_TEMPLATE/bug_report.md', '.github/ISSUE_TEMPLATE/task.md',
    '.github/ISSUE_TEMPLATE/config.yml', '.github/pull_request_template.md',
    '.github/workflows/template-check.yml',
)

MARKDOWN_SUFFIXES = frozenset({'.md', '.markdown'})
# Used only without Git, e.g. a ZIP-extracted copy of the template.
FALLBACK_EXCLUDED_DIRS = frozenset({'.git', 'node_modules', '.venv', 'venv', '__pycache__'})


def git_files(root):
    """Return tracked and untracked-but-not-ignored files, or None outside a Git work tree."""
    try:
        result = subprocess.run(
            ['git', '-C', str(root), 'ls-files', '-z',
             '--cached', '--others', '--exclude-standard'],
            capture_output=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    # Unmerged paths can be listed once per stage, so keep each name only once.
    names = dict.fromkeys(os.fsdecode(name) for name in result.stdout.split(b'\0') if name)
    return [root / name for name in names]


def walk_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in FALLBACK_EXCLUDED_DIRS]
        for filename in filenames:
            yield Path(dirpath) / filename


def iter_markdown(root):
    """Yield Markdown files Git would track, falling back to a directory walk without Git."""
    root = Path(root)
    files = git_files(root)
    if files is None:
        files = walk_files(root)
    for path in sorted(files):
        # --cached still lists tracked files that were deleted from the work tree.
        if path.suffix.lower() in MARKDOWN_SUFFIXES and path.is_file():
            yield path


def check_ignored_skills(root, names):
    """Check ignore rules even for tracked copies; skip non-Git distributions."""
    try:
        repo = subprocess.run(['git', '-C', str(root), 'rev-parse', '--is-inside-work-tree'],
                              capture_output=True, text=True)
    except FileNotFoundError:
        return []
    if repo.returncode != 0 or repo.stdout.strip() != 'true':
        return []
    paths = [f'{dest}/' for dest in DESTINATIONS]
    paths += [f'{dest}/{name}/SKILL.md' for dest in DESTINATIONS for name in names]
    result = subprocess.run(
        ['git', '-C', str(root), 'check-ignore', '--no-index', '--stdin', '-z'],
        input='\0'.join(paths) + '\0', capture_output=True, text=True,
    )
    if result.returncode not in (0, 1):
        return [f'git check-ignore failed: {result.stderr.strip()}']
    return [f'Ignored skill path: {path}: このままだと生成されたskillがcommitされない。'
            ' .gitignore / .git/info/exclude / global ignore を確認してください。'
            for path in result.stdout.split('\0') if path]


def check(root):
    root = Path(root).resolve()
    errors = []
    for name in REQUIRED:
        if not (root / name).is_file():
            errors.append(f'Missing file: {name}')
    try:
        names = discover_skills(root)
    except (OSError, ValueError) as error:
        errors.append(str(error))
        names = []
    errors.extend(check_ignored_skills(root, names))
    for name in names:
        path = root / 'skills' / name / 'SKILL.md'
        if not path.is_file():
            errors.append(f'Missing skill: {name}')
            continue
        content = path.read_text(encoding='utf-8')
        match = re.match(r'\A---\n(.*?)\n---\n', content, re.S)
        if not match:
            errors.append(f'Missing frontmatter: {path.relative_to(root)}')
            continue
        # This template uses single-line name and description fields only.
        fields = dict(re.findall(r'^(name|description):[ \t]*(.+)$', match[1], re.M))
        if fields.get('name') != name or not fields.get('description', '').strip(' "\''):
            errors.append(f'Invalid skill metadata: {name}')
    for path in iter_markdown(root):
        content = path.read_text(encoding='utf-8')
        # Check ordinary inline relative links, not remote URLs or heading anchors.
        for target in re.findall(r'\[[^\]\n]*\]\(([^\s)]+)\)', content):
            if target.startswith('#') or re.match(r'[a-zA-Z][a-zA-Z0-9+.-]*:', target):
                continue
            target = target.split('#')[0]
            if target and not (path.parent / target).exists():
                errors.append(f'Broken link in {path.relative_to(root)}: {target}')
    try:
        if not sync(root, check=True):
            errors.append('Run python3 scripts/sync_skills.py and commit both copies')
    except (OSError, ValueError) as error:
        errors.append(str(error))
    return errors


if __name__ == '__main__':
    problems = check(Path(__file__).resolve().parents[1])
    for problem in problems:
        print(f'ERROR: {problem}', file=sys.stderr)
    if not problems:
        print('Template checks passed (structure, local links, skill metadata and copies).')
    sys.exit(bool(problems))
