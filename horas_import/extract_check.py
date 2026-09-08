import re
html = open('/tmp/percurso_dashboard/index.html', encoding='utf-8').read()
scripts = re.findall(r'<script(?:(?!src)[^>]*)>(.*?)</script>', html, re.S)
print('num inline scripts:', len(scripts))
biggest = max(scripts, key=len)
open('/tmp/percurso_dashboard/_extract_check.js', 'w', encoding='utf-8').write(biggest)
print('len', len(biggest))

ids = re.findall(r'\bid="([^"]+)"', html)
from collections import Counter
c = Counter(ids)
dupes = {k: v for k, v in c.items() if v > 1}
print('duplicate ids:', dupes)

getels = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", html))
id_set = set(ids)
missing = sorted(g for g in getels if g not in id_set)
print('missing ids referenced by getElementById:', missing)
