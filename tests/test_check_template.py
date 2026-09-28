from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import check_template
from check_template import check, iter_markdown


class TemplateTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, relative, content='# Doc\n'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        return path

    def found(self):
        return {p.relative_to(self.root).as_posix() for p in iter_markdown(self.root)}

    def git(self, *args):
        subprocess.run(['git', '-C', str(self.root), *args], check=True, capture_output=True)

    def make_repo(self):
        if shutil.which('git') is None:
            self.skipTest('git is not installed')
        self.git('init', '-q')
        # "generated/" is not in FALLBACK_EXCLUDED_DIRS, so this proves .gitignore is used.
        self.write('.gitignore', 'node_modules/\ngenerated/\n')


class IterMarkdownTests(TemplateTestCase):
    def test_git_repo_uses_tracked_and_untracked_unignored_files(self):
        self.make_repo()
        self.write('docs/tracked.md')
        self.git('add', 'docs/tracked.md')
        self.write('docs/untracked.md')
        self.write('NOTES.MD')
        self.write('guide.markdown')
        self.write('generated/out.md')
        self.write('node_modules/pkg/README.md')
        self.write('src/app.ts', 'export {}\n')
        self.assertEqual(self.found(), {
            'NOTES.MD', 'docs/tracked.md', 'docs/untracked.md', 'guide.markdown',
        })

    def test_tracked_file_deleted_from_work_tree_is_skipped(self):
        self.make_repo()
        path = self.write('docs/gone.md')
        self.git('add', 'docs/gone.md')
        path.unlink()
        self.assertEqual(self.found(), set())

    def test_without_git_falls_back_to_directory_walk(self):
        self.write('docs/a.md')
        self.write('UPPER.MD')
        self.write('generated/out.md')
        self.write('node_modules/pkg/README.md')
        with mock.patch.object(check_template, 'git_files', return_value=None):
            found = self.found()
        self.assertEqual(found, {'UPPER.MD', 'docs/a.md', 'generated/out.md'})

    def test_broken_links_are_reported_only_for_checked_files(self):
        self.make_repo()
        self.write('docs/guide.md', '[broken](missing.md)\n')
        self.write('generated/README.md', '[broken](missing.md)\n')
        link_errors = [e for e in check(self.root) if e.startswith('Broken link')]
        self.assertEqual(link_errors, ['Broken link in docs/guide.md: missing.md'])


class IgnoreSkillsTests(TemplateTestCase):
    def ignored(self):
        return check_template.check_ignored_skills(self.root, ['custom'])

    def test_non_git_skips_ignore_check(self):
        self.assertEqual(self.ignored(), [])

    def test_ignored_directories_and_generated_files(self):
        self.make_repo()
        for pattern in ('.claude/', '.agents/skills/', '**/SKILL.md',
                        '.claude/skills/custom/SKILL.md'):
            with self.subTest(pattern=pattern):
                self.write('.gitignore', pattern + '\n')
                errors = self.ignored()
                self.assertTrue(errors)
                self.assertTrue(all('commitされない' in e for e in errors))

    def test_tracked_copy_is_still_checked(self):
        self.make_repo()
        self.write('.agents/skills/custom/SKILL.md')
        self.git('add', '.agents/skills/custom/SKILL.md')
        self.write('.gitignore', '.agents/\n')
        self.assertTrue(self.ignored())

    def test_unignored_destinations_pass(self):
        self.make_repo()
        self.write('.gitignore', '.claude/*\n!.claude/skills/\n')
        self.assertEqual(self.ignored(), [])

    def test_local_exclude_is_checked(self):
        self.make_repo()
        self.write('.git/info/exclude', '.agents/skills/\n')
        self.assertTrue(self.ignored())

    def test_global_exclude_is_checked(self):
        self.make_repo()
        excludes = self.write('global-ignore', '.claude/skills/\n')
        self.git('config', 'core.excludesFile', str(excludes))
        self.assertTrue(self.ignored())

    def test_git_error_is_reported(self):
        with mock.patch.object(check_template.subprocess, 'run', side_effect=[
            subprocess.CompletedProcess([], 0, 'true\n', ''),
            subprocess.CompletedProcess([], 128, '', 'failure'),
        ]):
            self.assertEqual(self.ignored(), ['git check-ignore failed: failure'])

    def test_new_skill_metadata_and_copies_are_checked(self):
        self.write('skills/new-skill/SKILL.md',
                   '---\nname: wrong\ndescription: example\n---\n')
        errors = check(self.root)
        self.assertIn('Invalid skill metadata: new-skill', errors)
        self.assertIn('Run python3 scripts/sync_skills.py and commit both copies', errors)


if __name__ == '__main__':
    unittest.main()