"""Run release gates on the exact staged engine, not a stale development copy."""
from pathlib import Path
import importlib.util, os, sys, unittest
root=Path(__file__).resolve().parents[1]
engine=Path(os.environ.get('EXAM_EXPORT_ENGINE_DIR',root/'scripts')).resolve()
sys.path.insert(0,str(engine))
import export_docx, export_hwpx, word_math, export_integrity
import structured_docx, solution_guide_docx, export_preflight, hwp_native, hwp_compat
export_integrity.verify()
suite=unittest.TestSuite()
for i, name in enumerate(['test_export_contract.py','test_export_docx.py','test_solution_math_wrap.py','test_export_hwpx.py','test_paper_form_layout.py']):
    spec=importlib.util.spec_from_file_location('export_gate_'+str(i),root/'tests'/name)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
result=unittest.TextTestRunner(verbosity=1).run(suite)
sys.exit(not result.wasSuccessful())
