import { setSetting, getSettings } from '../services/settings.js';
import { pool } from './pool.js';

const [key, value] = process.argv.slice(2);

async function main() {
  if (!key) {
    console.log('الإعدادات الحالية:');
    console.log(await getSettings());
    console.log('\nالاستخدام: node src/db/set-setting.js <KEY> <VALUE>');
    console.log('مثال: node src/db/set-setting.js FREE_MODE false');
    return;
  }
  await setSetting(key, value ?? '');
  console.log(`تم: ${key} = ${value ?? ''}`);
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
