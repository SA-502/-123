#!/usr/bin/env python3
"""Bundle index.html + css + js into one self-contained page fragment (for hosting as a single file).

Usage: python3 tools/bundle.py OUTPUT.html
The output omits <!doctype>/<html>/<head>/<body> so a host can wrap it in its own skeleton.
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
css = (root / 'css' / 'style.css').read_text()
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
scripts = re.findall(r'<script src="(js/[^"]+)"></script>', body)
body = re.sub(r'<script src="js/[^"]+"></script>\s*', '', body)
js = '\n'.join('/* ---- %s ---- */\n%s' % (f, (root / f).read_text()) for f in scripts)
if '</script' in js:
    sys.exit('script source contains "</script", cannot inline safely')
# fonts are separate files next to the page; in a single-file bundle they are embedded as data URIs
import base64
def embed(m):
    data = (root / 'fonts' / m.group(1)).read_bytes()
    return 'url("data:font/woff2;base64,%s")' % base64.b64encode(data).decode()
css = re.sub(r'url\("\.\./fonts/([^"]+)"\)', embed, css)
out = '<title>Gravewave</title>\n<style>\n%s\n</style>\n%s\n<script>\n%s\n</script>\n' % (css, body.strip(), js)
Path(sys.argv[1]).write_text(out)
print('wrote %s (%d bytes, %d scripts)' % (sys.argv[1], len(out), len(scripts)))
