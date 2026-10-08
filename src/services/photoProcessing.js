import sharp from 'sharp';

/**
 * يعالج صورة شخصية مرفوعة إلى نسختين (تُصنعان مرة واحدة عند الرفع، لا عند كل
 * طلب عرض - أسرع بكثير من التمويه الحيّ السابق):
 * - original: الصورة الحقيقية، بأقصى عرض/ارتفاع 1080px، WebP (للعرض الكامل بعد القبول).
 * - blurred: نسخة صغيرة مموَّهة فعلياً (للمعاينة قبل القبول ولقوائم التصفح).
 * .rotate() بلا وسائط يطبّق دوران EXIF الصحيح قبل أي تغيير حجم - ضروري لصور
 * الكاميرا التي تُخزَّن أفقياً مع علم دوران.
 */
export async function processPhoto(buffer) {
  const original = await sharp(buffer)
    .rotate()
    .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const blurred = await sharp(buffer)
    .rotate()
    .resize({ width: 200, height: 200, fit: 'inside' })
    .blur(12)
    .webp({ quality: 60 })
    .toBuffer();

  return { original, blurred };
}
