/**
 * محرك الحسابات الموحد للتقارير
 * جميع الدوال الحسابية المركزية موحدة ومرتبة بنظام واحد
 */

/**
 * تحويل القيمة إلى رقم آمن
 */
export const toNumber = (value) => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

/**
 * تقريب الرقم إلى عدد معين من العشرات العشرية
 */
export const roundNumber = (value, decimals = 2) => {
  const num = toNumber(value);
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

/**
 * حساب ساعات التشغيل
 * إذا كان وقت الإيقاف أصغر من وقت البداية، نضيف 24 ساعة
 */
export const calculateOperatingHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;

  try {
    // تحويل الأوقات من صيغة HH:mm إلى أرقام
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let startTotal = startHour + startMin / 60;
    let endTotal = endHour + endMin / 60;

    // إذا كان وقت الإيقاف أقل من البداية، نضيف 24 ساعة
    if (endTotal < startTotal) {
      endTotal += 24;
    }

    return roundNumber(endTotal - startTotal, 2);
  } catch {
    return 0;
  }
};

/**
 * حساب استهلاك الوقود
 * الصيغة: ساعات التشغيل * معدل الاستهلاك (19 لتر/ساعة)
 */
export const calculateFuelConsumed = (operatingHours, rate = 19) => {
  return roundNumber(toNumber(operatingHours) * rate, 2);
};

/**
 * حساب الرصيد الحالي للوقود
 * الصيغة: الرصيد السابق + الوقود المضاف + الوقود من البلدية - الاستهلاك - الفوارق
 */
export const calculateCurrentFuelBalance = ({
  previousFuelBalance = 0,
  fuelAdded = 0,
  fuelFromMunicipality = 0,
  fuelConsumed = 0,
  fuelDifference = 0
}) => {
  const balance =
    toNumber(previousFuelBalance) +
    toNumber(fuelAdded) +
    toNumber(fuelFromMunicipality) -
    toNumber(fuelConsumed) -
    toNumber(fuelDifference);

  return roundNumber(balance, 2);
};

/**
 * حساب الإنتاج اليومي للمياه
 * الصيغة: الإنتاج بعد الفلترة * ساعات التشغيل
 */
export const calculateWaterProduction = (afterFilterProduction, operatingHours) => {
  return roundNumber(toNumber(afterFilterProduction) * toNumber(operatingHours), 2);
};

/**
 * حساب إجمالي إنتاج الغاطس
 * الصيغة: إنتاج الغاطس * ساعات التشغيل
 */
export const calculateSubmersibleTotal = (submersibleProduction, operatingHours) => {
  return roundNumber(toNumber(submersibleProduction) * toNumber(operatingHours), 2);
};

/**
 * حساب كمية العادم (الفاقد)
 * الصيغة: max(0, إجمالي الغاطس - الإنتاج اليومي)
 */
export const calculateWaste = (submersibleTotal, dailyProduction) => {
  const waste = toNumber(submersibleTotal) - toNumber(dailyProduction);
  return roundNumber(Math.max(0, waste), 2);
};

/**
 * حساب نسبة الفاقد (العادم) بالنسبة المئوية
 * الصيغة: (العادم / الإنتاج اليومي) * 100
 * إذا كان الإنتاج = 0، تكون النسبة = 0
 */
export const calculateWastePercentage = (waste, dailyProduction) => {
  const daily = toNumber(dailyProduction);
  if (daily <= 0) return 0;
  return roundNumber((toNumber(waste) / daily) * 100, 2);
};

/**
 * حساب إجماليات الجهات المستفيدة
 * تحسب: إجمالي الكمية المعبأة، إجمالي السيارات، متوسط السيارة
 */
export const calculateEntitiesTotals = (entities = []) => {
  if (!Array.isArray(entities)) {
    return { totalQuantity: 0, totalCars: 0, averagePerCar: 0 };
  }

  const totalQuantity = entities.reduce((sum, entity) => {
    return sum + toNumber(entity.quantity || 0);
  }, 0);

  const totalCars = entities.reduce((sum, entity) => {
    return sum + toNumber(entity.cars || 0);
  }, 0);

  const averagePerCar = totalCars > 0 ? roundNumber(totalQuantity / totalCars, 2) : 0;

  return {
    totalQuantity: roundNumber(totalQuantity, 2),
    totalCars,
    averagePerCar
  };
};

/**
 * حساب التقرير الكامل
 * ترجع نسخة محسوبة من التقرير مع القيم المحسوبة
 */
export const calculateReport = (report) => {
  if (!report) return null;

  // حساب ساعات التشغيل
  const operatingHours = calculateOperatingHours(report.startTime, report.endTime);

  // حساب استهلاك الوقود
  const fuelConsumed = calculateFuelConsumed(operatingHours, 19);

  // حساب الرصيد الحالي
  const currentFuelBalance = calculateCurrentFuelBalance({
    previousFuelBalance: report.previousFuelBalance,
    fuelAdded: report.fuelAdded,
    fuelFromMunicipality: report.fuelFromMunicipality,
    fuelConsumed,
    fuelDifference: report.fuelDifference
  });

  // حساب الإنتاج اليومي
  const dailyProduction = calculateWaterProduction(report.afterFilterProduction, operatingHours);

  // حساب إجمالي الغاطس
  const submersibleTotal = calculateSubmersibleTotal(report.submersibleProduction, operatingHours);

  // حساب العادم
  const waste = calculateWaste(submersibleTotal, dailyProduction);

  // حساب نسبة العادم
  const wastePercentage = calculateWastePercentage(waste, dailyProduction);

  // حساب إجماليات الجهات
  const { totalQuantity: bottledWater, totalCars, averagePerCar } = calculateEntitiesTotals(report.entities);

  // إرجاع التقرير المحسوب مع الحفاظ على باقي البيانات
  return {
    ...report,
    operatingHours,
    fuelConsumed,
    currentFuelBalance,
    dailyProduction,
    waste,
    wastePercentage,
    bottledWater,
    totalCars,
    averagePerCar
  };
};

/**
 * فحص التقرير والتحقق من صحة البيانات
 * ترجع كائن يحتوي على الأخطاء والتنبيهات والتقرير المحسوب
 */
export const validateReport = (report) => {
  const errors = [];
  const warnings = [];

  if (!report) {
    return {
      errors: ['التقرير غير موجود'],
      warnings: [],
      calculated: null
    };
  }

  // حساب التقرير
  const calculated = calculateReport(report);

  // ===== فحوصات الأخطاء (ERRORS) =====

  // التاريخ غير موجود
  if (!report.date) {
    errors.push('التاريخ غير موجود');
  }

  // المحطة غير موجودة
  if (!report.station) {
    errors.push('المحطة غير موجودة');
  }

  // وقت البداية أو الإيقاف غير موجود
  if (!report.startTime || !report.endTime) {
    errors.push('وقت البداية أو الإيقاف غير موجود');
  }

  // ساعات التشغيل <= 0
  if (calculated.operatingHours <= 0) {
    errors.push('ساعات التشغيل يجب أن تكون أكبر من صفر');
  }

  // القيم الرقمية الأساسية أقل من صفر بدون سبب
  if (toNumber(report.previousFuelBalance) < 0) {
    errors.push('الرصيد الافتتاحي لا يمكن أن يكون سالباً');
  }

  if (toNumber(report.fuelAdded) < 0) {
    errors.push('كمية الوقود المضافة لا يمكن أن تكون سالبة');
  }

  if (toNumber(report.fuelFromMunicipality) < 0) {
    errors.push('كمية الوقود المستلمة من البلدية لا يمكن أن تكون سالبة');
  }

  if (toNumber(report.submersibleProduction) < 0) {
    errors.push('إنتاج الغاطس لا يمكن أن يكون سالباً');
  }

  if (toNumber(report.afterFilterProduction) < 0) {
    errors.push('الإنتاج بعد الفلترة لا يمكن أن يكون سالباً');
  }

  // الرصيد الحالي أقل من صفر
  if (calculated.currentFuelBalance < 0) {
    errors.push('الرصيد الحالي لا يمكن أن يكون سالباً - تحقق من البيانات المدخلة');
  }

  // entities ليست Array
  if (!Array.isArray(report.entities)) {
    errors.push('بيانات الجهات المستفيدة يجب أن تكون قائمة');
  }

  // ===== فحوصات التنبيهات (WARNINGS) =====

  // المياه المعبأة أكبر من الإنتاج
  if (calculated.bottledWater > calculated.dailyProduction && calculated.dailyProduction > 0) {
    warnings.push('⚠️ كمية المياه المعبأة تتجاوز الإنتاج الفعلي لهذا اليوم');
  }

  // الرصيد الحالي أقل من 300
  if (calculated.currentFuelBalance < 300 && calculated.currentFuelBalance >= 0) {
    warnings.push('⚠️ تنبيه: مخزون الوقود المتبقي منخفض جداً (أقل من 300 لتر)');
  }

  // نسبة العادم أكبر من 45%
  if (calculated.wastePercentage > 45) {
    warnings.push('⚠️ نسبة الفاقد (العادم) مرتفعة بشكل غير اعتيادي');
  }

  // فوارق الوقود أكبر من صفر
  if (toNumber(report.fuelDifference) > 0) {
    warnings.push('⚠️ توجد فوارق في الوقود - يرجى مراجعة القراءات');
  }

  // لا توجد جهات مستفيدة مسجلة
  if (!Array.isArray(report.entities) || report.entities.length === 0) {
    warnings.push('ℹ️ لا توجد جهات مستفيدة مسجلة في هذا التقرير');
  }

  // عدد السيارات = 0 مع وجود كمية مياه معبأة
  if (calculated.totalCars === 0 && calculated.bottledWater > 0) {
    warnings.push('⚠️ عدد السيارات = 0 بينما توجد كمية مياه معبأة');
  }

  // الإنتاج = 0 مع وجود ساعات تشغيل
  if (calculated.dailyProduction === 0 && calculated.operatingHours > 0) {
    warnings.push('⚠️ الإنتاج اليومي = 0 بينما توجد ساعات تشغيل');
  }

  return {
    errors,
    warnings,
    calculated
  };
};
