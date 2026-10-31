import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VENV = path.join(__dirname, '.venv');
const PYTHON = process.platform === 'win32'
  ? path.join(VENV, 'Scripts', 'python.exe')
  : path.join(VENV, 'bin', 'python');

function findPython() {
  const candidates = [
    process.env.KEXI_PYTHON,
    process.platform === 'win32' ? 'py' : null,
    'python3',
    'python',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const args = candidate === 'py' ? ['-3', '--version'] : ['--version'];
    const result = spawnSync(candidate, args, { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return candidate;
  }
  return null;
}

if (!fs.existsSync(PYTHON)) {
  const python = findPython();
  if (!python) {
    console.error('未找到 Python 3。请安装 Python 3.10+ 后重新运行 npm run setup:asr。');
    process.exit(1);
  }
  const args = python === 'py' ? ['-3', '-m', 'venv', VENV] : ['-m', 'venv', VENV];
  const created = spawnSync(python, args, { stdio: 'inherit', windowsHide: true });
  if (created.status !== 0) process.exit(created.status ?? 1);
}

const env = {
  ...process.env,
  PYTHONPATH: path.join(__dirname, 'pyfix'),
  PIP_DISABLE_PIP_VERSION_CHECK: '1',
  PIP_DEFAULT_TIMEOUT: '120',
  PIP_INDEX_URL:
    process.env.PIP_INDEX_URL || 'https://pypi.tuna.tsinghua.edu.cn/simple',
  HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
  HF_HOME: path.join(__dirname, '.hf'),
  HF_HUB_DISABLE_XET: '1',
};

console.log('正在安装本地语音识别组件（仅首次需要）…');
const install = spawnSync(
  PYTHON,
  ['-m', 'pip', 'install', '--upgrade', 'faster-whisper', '--prefer-binary', '--no-input'],
  { stdio: 'inherit', env, windowsHide: true },
);
if (install.status !== 0) {
  console.error('安装失败。请检查网络后重试。');
  process.exit(install.status ?? 1);
}

console.log('');
console.log('本地语音识别组件已安装。');
console.log('首次点击「自动转写」时会下载 small 模型（约 480MB）。');
console.log(`模型缓存目录：${path.join(__dirname, 'models')}`);
