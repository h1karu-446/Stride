#!/usr/bin/env python3
"""Copy discovered shared SKILL.md files to tool discovery directories."""
import argparse
from pathlib import Path
import sys

DESTINATIONS = ('.agents/skills', '.claude/skills')


def reject_symlinks(root, path):
    for part in (path, *path.parents):
        if part == root:
            break
        if part.is_symlink():
            raise ValueError(f'Symlink is not supported: {part.relative_to(root)}')


def discover_skills(root):
    root = Path(root).resolve()
    paths = sorted((root / 'skills').glob('*/SKILL.md'))
    if not paths:
        raise ValueError('No skills found: skills/*/SKILL.md')
    for path in paths:
        reject_symlinks(root, path)
        if not path.is_file():
            raise ValueError(f'Not a file: {path.relative_to(root)}')
    return [path.parent.name for path in paths]


def sync(root, check=False):
    root = Path(root).resolve()
    changes = []
    # Validate the full set before writing, so a missing source cannot cause a partial sync.
    for name in discover_skills(root):
        source = root / 'skills' / name / 'SKILL.md'
        reject_symlinks(root, source)
        data = source.read_bytes()
        for destination in DESTINATIONS:
            target = root / destination / name / 'SKILL.md'
            reject_symlinks(root, target)
            if target.exists() and not target.is_file():
                raise ValueError(f'Not a file: {target.relative_to(root)}')
            if not target.exists() or target.read_bytes() != data:
                changes.append((target, data))
    if check:
        for target, _ in changes:
            print(f'OUT OF SYNC: {target.relative_to(root)}')
        return not changes
    for target, data in changes:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        print(f'Updated {target.relative_to(root)}')
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check without writing')
    args = parser.parse_args()
    try:
        return 0 if sync(Path(__file__).resolve().parents[1], args.check) else 1
    except (OSError, ValueError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
