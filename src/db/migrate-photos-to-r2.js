/**
 * ينقل صور المستخدمين الموجودة محلياً (قبل اعتماد هذا الملف) إلى R2.
 * يُشغَّل مرة واحدة فقط، بعد ضبط متغيرات R2_* في البيئة:
 *   node src/db/migrate-photos-to-r2.js
 *
 * ملاحظة مهمة: الصور القديمة محفوظة بأسماء ملفات عشوائية (uN_timestamp.ext)
 * من النظام السابق، وليست بصيغة WebP المعالَجة الجديدة - لذا يعيد هذا
 * السكربت معالجتها بـ sharp (نفس processPhoto المستخدمة عند كل رفع جديد)
 * قبل رفعها، حتى تُقرأ بنفس الصيغة والمفاتيح التي يتوقّعها photos.routes.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { query, pool } from './pool.js';
import { config } from '../config/index.js';
import { processPhoto } from '../services/photoProcessing.js';
import { putObject, storageBackend } from '../services/storage.js';

async function main() {
  if (storageBackend !== 'r2') {
    console.error(
      '❌ R2 غير مُفعَّل حالياً (لم تُضبط R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET).\n' +
        '   أضفها في متغيرات البيئة أولاً ثم أعد تشغيل هذا السكربت.'
    );
    process.exitCode = 1;
    return;
  }

  const localDir = path.resolve(config.uploadDir);
  const { rows } = await query(
    'SELECT user_id, photo_path FROM profiles WHERE photo_path IS NOT NULL'
  );
  console.log(`عدد الملفات الشخصية التي تحتوي صورة: ${rows.length}`);

  let moved = 0;
  let skipped = 0;
  for (const row of rows) {
    // صورة سبق نقلها بالفعل (بالنظام الجديد) تكون photo_path رقم timestamp صِرف
    // بلا امتداد ملف - لا حاجة لإعادة نقلها.
    if (/^\d+$/.test(row.photo_path)) {
      skipped++;
      continue;
    }
    const localFile = path.join(localDir, row.photo_path);
    if (!fs.existsSync(localFile)) {
      console.warn(`⚠ تخطّي المستخدم ${row.user_id}: الملف المحلي غير موجود (${row.photo_path})`);
      skipped++;
      continue;
    }
    try {
      const buffer = await fs.promises.readFile(localFile);
      const { original, blurred } = await processPhoto(buffer);
      await putObject(`photos/${row.user_id}/original.webp`, original, 'image/webp');
      await putObject(`photos/${row.user_id}/blurred.webp`, blurred, 'image/webp');
      await query('UPDATE profiles SET photo_path = $1 WHERE user_id = $2', [
        String(Date.now()),
        row.user_id,
      ]);
      moved++;
      console.log(`✓ نُقلت صورة المستخدم ${row.user_id}`);
    } catch (e) {
      console.error(`✗ فشل نقل صورة المستخدم ${row.user_id}:`, e.message);
    }
  }
  console.log(`\nاكتمل: نُقل ${moved}، تم تخطّيه ${skipped}.`);
}

main()
  .catch((err) => {
    console.error('فشل السكربت:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
