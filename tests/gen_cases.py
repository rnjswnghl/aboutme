# 논문 저장소의 hodges_lehmann()·scipy wilcoxon으로 기준값을 만든다 (reflex-hub 경로를 인자로 받음).
import sys, json, importlib.util
import numpy as np
from scipy import stats
spec = importlib.util.spec_from_file_location('ra', sys.argv[1] + '/analysis/run_analysis.py')
ra = importlib.util.module_from_spec(spec); spec.loader.exec_module(ra)
rng = np.random.default_rng(7)
cases = []
for n in [2,3,4,5,6,8,12,20,30,55]:
    for eff in [-30, 0, 10]:
        d = np.round(rng.normal(eff, 40, n), 2)
        w = stats.wilcoxon(d, alternative='less', **ra.PREREG['wilcoxon'])
        hl = ra.hodges_lehmann(d.copy(), 0.05)
        cases.append({'d': d.tolist(), 'p': float(w.pvalue), 'w': float(w.statistic), 'hl': hl['hl'], 'ci': hl['ci95']})
d = np.array([-10,-10,-20,5,5,-30,-10,15.0])  # 동순위
w = stats.wilcoxon(d, alternative='less', **ra.PREREG['wilcoxon']); hl = ra.hodges_lehmann(d.copy())
cases.append({'d': d.tolist(), 'p': float(w.pvalue), 'w': float(w.statistic), 'hl': hl['hl'], 'ci': hl['ci95']})
json.dump(cases, open(sys.argv[2], 'w'))
print(len(cases))
