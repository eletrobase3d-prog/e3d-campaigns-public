"""Offline, heuristic pre-publication check. Reports paths/categories, never values."""
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', '.next', 'dist', 'coverage', '__pycache__'}
FORBIDDEN = {'.docx', '.pdf', '.zip', '.dump', '.backup', '.sqlite', '.db', '.csv', '.xlsx', '.pem', '.key', '.p12', '.pfx', '.log'}
PATTERNS = {
    'private-key': r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'github-token': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b',
    'aws-key': r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'jwt-literal': r'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b',
    'absolute-user-path': r'(?:[A-Za-z]:[/\\]Users[/\\]|/home/|/Users/)',
    'database-url-with-password': r'(?:postgres(?:ql)?|mysql|redis)://[^\s:$]+:[^\s@$]+@',
    'private-ip': r'\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b',
}
ALLOWED_HOSTS = {'localhost', '127.0.0.1', 'api', 'example.invalid', 'registry.npmjs.org',
    'github.com', 'json.schemastore.org', 'opencollective.com', 'www.patreon.com',
    'feross.org', 'tidelift.com', 'paulmillr.com', 'dotenvx.com', 'buymeacoffee.com', 'nextjs.org', 'wa.me', 'www.w3.org'}

def inspect():
    issues = []
    count = 0
    for path in ROOT.rglob('*'):
        rel = path.relative_to(ROOT)
        if not path.is_file() or any(part in SKIP for part in rel.parts):
            continue
        count += 1
        def flag(category): issues.append((str(rel), category))
        if path.suffix.lower() in FORBIDDEN: flag('forbidden-artifact')
        if path.name.startswith('.env') and path.name != '.env.example': flag('environment-file')
        if path.name in {'.npmrc', '.netrc', '.pypirc'}: flag('credential-config')
        try: body = path.read_text(encoding='utf-8-sig')
        except UnicodeError:
            flag('binary-needs-manual-review'); continue
        if path.resolve() == Path(__file__).resolve(): continue
        for category, pattern in PATTERNS.items():
            if re.search(pattern, body): flag(category)
        for address in re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', body):
            if not address.lower().endswith(('@example.invalid', '@example.com')): flag('contact-needs-review')
        for url in re.findall(r'https?://[^\s\"\'<>`]+', body):
            try: host = urlsplit(url).hostname
            except ValueError: host = None
            if host not in ALLOWED_HOSTS: flag('url-host-needs-review')
        if path.name == '.env.example':
            for line in body.splitlines():
                if '=' in line and not line.lstrip().startswith('#'):
                    key, value = line.split('=', 1)
                    if re.search(r'PASSWORD|SECRET|TOKEN|PRIVATE_KEY', key, re.I) and value.strip(): flag('nonempty-example-secret')
        # Literal assignments warrant review; environment lookups and generated values do not match.
        if re.search(r'\b(?:password|passwordHash|JWT_SECRET|apiKey|accessToken)\s*[:=]\s*[\"\'][^\"\']+[\"\']', body, re.I):
            flag('literal-credential-needs-review')
    return count, sorted(set(issues))

if __name__ == '__main__':
    count, issues = inspect()
    for path, category in issues: print(f'{path}: {category}')
    print(f'Checked {count} files; {len(issues)} findings. Heuristic scan only; review the diff and repository history separately.')
    sys.exit(1 if issues else 0)
