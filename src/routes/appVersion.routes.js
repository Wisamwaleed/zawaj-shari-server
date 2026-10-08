import { Router } from 'express';
import { getSettings } from '../services/settings.js';

const router = Router();

/**
 * معلومات تحديث التطبيق (APK مباشر - لا متجر). عام بلا مصادقة عمداً:
 * يجب أن يعمل حتى قبل تسجيل الدخول، ولا يُفشل التطبيق أبداً لو تعذّر الوصول إليه.
 */
router.get('/', async (req, res, next) => {
  try {
    const s = await getSettings();
    res.json({
      minVersionCode: parseInt(s.MIN_VERSION_CODE, 10) || 1,
      latestVersionCode: parseInt(s.LATEST_VERSION_CODE, 10) || 1,
      apkUrl: s.APK_URL || '',
      changelog: s.CHANGELOG || '',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
