import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sync_skills import DESTINATIONS, discover_skills, sync


class SyncSkillsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)
        self.names = ('alpha', 'beta', 'gamma')
        for name in self.names:
            path = self.root / 'skills' / name / 'SKILL.md'
            path.parent.mkdir(parents=True)
            path.write_text(f'Original {name}\n', encoding='utf-8')

    def test_check_does_not_create_files(self):
        self.assertFalse(sync(self.root, check=True))
        self.assertFalse((self.root / '.agents').exists())
        self.assertFalse((self.root / '.claude').exists())

    def test_sync_copies_content_and_is_idempotent(self):
        self.assertTrue(sync(self.root))
        self.assertTrue(sync(self.root, check=True))
        targets = [self.root / d / n / 'SKILL.md' for d in DESTINATIONS for n in self.names]
        before = {p: p.stat().st_mtime_ns for p in targets}
        sync(self.root)
        self.assertEqual(before, {p: p.stat().st_mtime_ns for p in targets})
        for path in targets:
            self.assertEqual(path.read_bytes(), (self.root / 'skills' / path.parent.name / 'SKILL.md').read_bytes())

    def test_detects_drift_then_updates_both_tools(self):
        sync(self.root)
        source = self.root / 'skills' / self.names[0] / 'SKILL.md'
        source.write_text('Changed\n', encoding='utf-8')
        self.assertFalse(sync(self.root, check=True))
        sync(self.root)
        self.assertTrue(sync(self.root, check=True))
        for dest in DESTINATIONS:
            self.assertEqual((self.root / dest / self.names[0] / 'SKILL.md').read_text(), 'Changed\n')

    def test_preserves_unrelated_skills(self):
        custom = self.root / '.claude/skills/custom/SKILL.md'
        custom.parent.mkdir(parents=True)
        custom.write_text('Local skill', encoding='utf-8')
        sync(self.root)
        self.assertEqual(custom.read_text(), 'Local skill')

    def test_new_skill_is_discovered_without_configuration(self):
        path = self.root / 'skills/new-skill/SKILL.md'
        path.parent.mkdir()
        path.write_text('New skill')
        self.assertEqual(discover_skills(self.root), ['alpha', 'beta', 'gamma', 'new-skill'])
        sync(self.root)
        for dest in DESTINATIONS:
            self.assertEqual((self.root / dest / 'new-skill/SKILL.md').read_text(), 'New skill')

    def test_empty_sources_fail_without_writing(self):
        for path in (self.root / 'skills').glob('*/SKILL.md'):
            path.unlink()
        with self.assertRaisesRegex(ValueError, 'No skills found'):
            sync(self.root)
        self.assertFalse((self.root / '.agents').exists())

    def test_invalid_source_does_not_partially_write(self):
        path = self.root / 'skills/gamma/SKILL.md'
        path.unlink()
        path.mkdir()
        with self.assertRaises(ValueError):
            sync(self.root)
        self.assertFalse((self.root / '.agents').exists())

    def test_rejects_symlink_source(self):
        path = self.root / 'skills/gamma/SKILL.md'
        path.unlink()
        path.symlink_to(self.root / 'skills/alpha/SKILL.md')
        with self.assertRaises(ValueError):
            sync(self.root)
        self.assertFalse((self.root / '.agents').exists())

    def test_rejects_symlink_destination(self):
        outside = self.root / 'outside'
        outside.mkdir()
        try:
            (self.root / '.agents').symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f'Symlinks unavailable: {error}')
        with self.assertRaises(ValueError):
            sync(self.root)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
