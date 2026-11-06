"""Stage a trusted, source-only Treasure Bot ZIP and stock Python for the Windows edition."""
import argparse
from pathlib import Path, PurePosixPath
import shutil
import sys
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bot_zip', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    destination = args.destination.resolve()
    if destination.exists():
        raise SystemExit('Choose a new, empty staging path.')
    with zipfile.ZipFile(args.bot_zip) as archive:
        entries = {}
        for info in archive.infolist():
            path = PurePosixPath(info.filename)
            if path.is_absolute() or '..' in path.parts or any(':' in p or '\\' in p for p in path.parts):
                raise SystemExit('Unexpected archive path')
            if info.is_dir() or len(path.parts)<2:
                continue
            rel = Path(*path.parts[1:])
            if rel.parts[0] in {'data','.git','.env','logs'} or rel.suffix in {'.db','.sqlite','.sqlite3','.bin','.key','.pem'}:
                raise SystemExit('Supply a clean source archive without account or runtime data.')
            if rel in entries:
                raise SystemExit('Duplicate archive path')
            entries[rel] = info
        for required in ('office_host.py','app.py','config.json','trading/office_panel.py'):
            if Path(required) not in entries:
                raise SystemExit('Missing '+required)
        for rel,info in entries.items():
            out = destination/'bot'/rel
            out.parent.mkdir(parents=True,exist_ok=True)
            with archive.open(info) as src, out.open('xb') as dst:
                shutil.copyfileobj(src,dst)
    base = Path(sys.base_prefix)
    runtime = destination/'python'
    runtime.mkdir()
    for source in [base/'python.exe',base/'LICENSE.txt',*base.glob('python*.dll'),*base.glob('vcruntime*.dll')]:
        shutil.copy2(source,runtime/source.name)
    for folder in ('DLLs','Lib','tcl'):
        shutil.copytree(base/folder,runtime/folder,ignore=shutil.ignore_patterns(
            'site-packages','__pycache__','test','tests','*.pyc','sitecustomize.py','usercustomize.py'))


if __name__ == '__main__':
    main()
