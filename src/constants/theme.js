/**
 * ألوان الهوية البصرية (أسود فاخر + ذهب) للصفحات العامة التي يُنشئها السيرفر
 * مباشرة كـ HTML (/download, /privacy, /terms, /admin). لا يمكن لهذه الصفحات
 * استيراد theme.js الخاص بتطبيق الموبايل (React Native)، فهذا الملف هو
 * نظيره على جهة السيرفر - غيّر القيم هنا فقط لتغيير اللون في كل الصفحات معاً.
 */
export const webColors = {
  bg: '#0D0D0D',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(212,175,55,0.3)',
  gold: '#D4AF37',
  text: '#F5F0E6',
  textSoft: '#A8A29E',
  inkOnGold: '#1A1400',
  danger: '#E11D48',
};
