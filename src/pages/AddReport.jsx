import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, getDocs, doc, getDoc, updateDoc, orderBy } from 'firebase/firestore';
import { format, parse } from 'date-fns';
import { arSA } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { 
  Zap, Fuel, Droplet, Users, User,
  CheckCircle, ChevronRight, ChevronLeft, Save,
  AlertCircle, Plus, Info, Trash2,
  Calculator, Beaker, MapPin, Activity, ShieldCheck,
  Clock, Gauge
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logAction } from '../utils/logger';
import { calculateReport, validateReport } from '../utils/calculations';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingScreen from '../components/LoadingScreen';

const steps = [
  { id: 1, name: 'الهوية والعامة', icon: <MapPin size={18} /> },
  { id: 2, name: 'التشغيل الفني', icon: <Zap size={18} /> },
  { id: 3, name: 'إدارة الوقود', icon: <Fuel size={18} /> },
  { id: 4, name: 'إنتاج المياه', icon: <Droplet size={18} /> },
  { id: 5, name: 'الفحوصات', icon: <Beaker size={18} /> },
  { id: 6, name: 'التوزيع', icon: <Users size={18} /> },
  { id: 7, name: 'الاعتماد', icon: <CheckCircle size={18} /> },
];

const FUEL_RATE = 19; 

const AddReport = () => {
  const { userData, currentUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    station: 'المحطة الرئيسية',
    operatorName: userData?.name || '',
    startTime: '06:00',
    endTime: '18:00',
    operatingHours: 12,
    generatorStatus: 'يعمل',
    fuelAdded: 0,
    fuelConsumed: 228, 
    fuelFromMunicipality: 0,
    previousFuelBalance: 0,
    currentFuelBalance: 0,
    fuelDifference: 0,
    submersibleProduction: 0,
    afterFilterProduction: 0,
    dailyProduction: 0,
    waste: 0,
    wastePercentage: 0,
    bottledWater: 0,
    phAfterDesalination: '', phSubmersible: '', tdsDesalinated: '', tdsWell: '', tdsWaste: '', freeChlorine: '',
    entities: [],
    notes: ''
  });

  const [alerts, setAlerts] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [stations, setStations] = useState([]);
  const [isMaintenance, setIsMaintenance] = useState(false);

  const checkMaintenance = async () => {
    try {
      const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
      if (settingsSnap.exists() && settingsSnap.data().maintenanceMode) {
        setIsMaintenance(true);
      }
    } catch (err) {
      console.error('Maintenance check failed:', err);
    }
  };

  const fetchStations = async () => {
    try {
      const q = query(collection(db, 'stations'), orderBy('name'));
      const snap = await getDocs(q);
      setStations(snap.docs.map(docItem => ({ id: docItem.id, ...docItem.data() })));
    } catch (err) {
      console.error('Failed to fetch stations:', err);
    }
  };

  const fetchReportToEdit = async () => {
    try {
      setLoading(true);
      setIsEdit(true);
      const docSnap = await getDoc(doc(db, 'reports', id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData({ ...formData, ...data });
      } else {
        toast.error('التقرير غير موجود');
        navigate('/archive');
      }
    } catch (error) {
      console.error(error);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviousFuelBalance = async () => {
    try {
      const reportsRef = collection(db, 'reports');
      const allReportsSnap = await getDocs(query(reportsRef));
      let totalConsumed = 0;
      let totalAdded = 0;

      allReportsSnap.forEach(doc => {
        const d = doc.data();
        totalConsumed += Number(d.fuelConsumed || 0);
        totalAdded += (Number(d.fuelAdded || 0) + Number(d.fuelFromMunicipality || 0));
      });

      const fuelRef = collection(db, 'fuelEntries');
      const allFuelSnap = await getDocs(query(fuelRef));
      let totalReceived = 0;
      allFuelSnap.forEach(doc => totalReceived += Number(doc.data().quantityLiters || 0));

      const balance = (totalReceived + totalAdded) - totalConsumed;
      setFormData(prev => ({ ...prev, previousFuelBalance: Math.round(balance * 100) / 100 }));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    checkMaintenance();
    fetchStations();
    if (id) {
      fetchReportToEdit();
    } else {
      fetchPreviousFuelBalance();
    }
  }, [id]);

  useEffect(() => {
    // حساب القيم الموحدة من محرك الحسابات
    const calculated = calculateReport(formData);
    
    if (calculated) {
      // تحديث النموذج بالقيم المحسوبة
      setFormData(prev => ({
        ...prev,
        operatingHours: calculated.operatingHours,
        fuelConsumed: calculated.fuelConsumed,
        currentFuelBalance: calculated.currentFuelBalance,
        dailyProduction: calculated.dailyProduction,
        waste: calculated.waste,
        wastePercentage: calculated.wastePercentage,
        bottledWater: calculated.bottledWater
      }));

      // التحقق من صحة البيانات
      const validation = validateReport(formData);
      setValidationResult(validation);

      // عرض التنبيهات فقط (بدون الأخطاء هنا)
      setAlerts(validation.warnings);
    }
  }, [
    formData.startTime, 
    formData.endTime, 
    formData.fuelAdded, 
    formData.fuelFromMunicipality, 
    formData.fuelDifference, 
    formData.previousFuelBalance, 
    formData.submersibleProduction, 
    formData.afterFilterProduction, 
    formData.entities
  ]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value }));
  };

  const saveReport = async () => {
    try {
      // التحقق من الأخطاء الحرجة
      const validation = validateReport(formData);
      
      if (validation.errors.length > 0) {
        // عرض الأخطاء الحرجة
        const errorMessage = validation.errors.join('\n');
        toast.error(`لا يمكن حفظ التقرير:\n${errorMessage}`, {
          duration: 5,
          style: {
            whiteSpace: 'pre-line'
          }
        });
        return;
      }

      setLoading(true);
      
      // استخدام البيانات المحسوبة
      const calculatedData = validation.calculated;
      
      const reportData = {
        ...calculatedData,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        status: validation.warnings.length > 0 ? 'تنبيهات' : 'سليم',
        alerts: validation.warnings
      };

      if (isEdit) {
        await updateDoc(doc(db, 'reports', id), reportData);
        await logAction('تعديل تقرير', `تعديل تقرير ${formData.station} - ${formData.date}`, userData);
        toast.success('تم التحديث بنجاح');
      } else {
        await addDoc(collection(db, 'reports'), { 
          ...reportData, 
          createdAt: serverTimestamp(), 
          createdBy: currentUser.uid 
        });
        await logAction('إضافة تقرير', `إضافة تقرير ${formData.station} - ${formData.date}`, userData);
        toast.success('تم الحفظ بنجاح');
      }
      navigate('/archive');
    } catch (error) {
      console.error(error);
      toast.error('خطأ في الحفظ');
    } finally {
      setLoading(false);
    }
  };

  const StepHeader = ({ title, subtitle, icon }) => (
    <div className="flex items-center gap-6 mb-10 border-b border-slate-100 dark:border-white/5 pb-8 relative z-10">
      <div className="w-16 h-16 bg-primary-600 text-white rounded-[24px] flex items-center justify-center shadow-2xl shadow-primary-500/30 group-hover:rotate-6 transition-transform">
        {icon}
      </div>
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white leading-tight">{title}</h2>
        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">{subtitle}</p>
      </div>
    </div>
  );

  const renderGeneral = () => (
    <div className="space-y-10 py-4">
      <StepHeader title="البيانات العامة للمحطة" subtitle="تعريف الوردية والموقع المسؤول" icon={<MapPin size={32} />} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
           <label className="text-xs font-black text-slate-400 uppercase tracking-widest">تاريخ التقرير</label>
           <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold" />
        </div>
        <div className="space-y-4">
           <label className="text-xs font-black text-slate-400 uppercase tracking-widest">المحطة المستهدفة</label>
           <select name="station" value={formData.station} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold">
              {stations.length > 0 ? (
                stations.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))
              ) : (
                <option value="المحطة الرئيسية">المحطة الرئيسية</option>
              )}
           </select>
        </div>
        <div className="space-y-4 md:col-span-2">
           <label className="text-xs font-black text-slate-400 uppercase tracking-widest">اسم المشغل المسؤول</label>
           <div className="relative">
              <input type="text" name="operatorName" value={formData.operatorName} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold pr-12" />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
           </div>
        </div>
      </div>
      <div className="p-6 bg-primary-500/5 rounded-3xl border border-primary-500/10 flex items-center gap-4">
         <Info size={24} className="text-primary-500 shrink-0" />
         <p className="text-xs font-bold text-slate-500 leading-relaxed">تنبيه: سيتم ربط كافة البيانات الرقمية المدخلة في الخطوات القادمة بحسابات موحدة آلية</p>
      </div>
    </div>
  );

  const renderGenerator = () => (
    <div className="space-y-10 py-4">
      <StepHeader title="التشغيل الفني والمولدات" subtitle="مراقبة ساعات العمل والحالة التشغيلية" icon={<Zap size={32} />} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-8">
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest">بداية التشغيل</label>
                 <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold text-center" />
              </div>
              <div className="space-y-3">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest">إيقاف التشغيل</label>
                 <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold text-center" />
              </div>
           </div>
           <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">الحالة التشغيلية</label>
              <select name="generatorStatus" value={formData.generatorStatus} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold">
                 <option value="يعمل">يعمل بشكل مثالي</option>
                 <option value="صيانة">تحت الصيانة المجدولة</option>
                 <option value="عطل">متوقف لوجود خلل فني</option>
              </select>
           </div>
        </div>
        
        <div className="bg-slate-900 dark:bg-white/[0.03] rounded-[32px] p-8 flex flex-col justify-between text-white relative overflow-hidden group shadow-2xl">
           <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600 blur-[80px] -mr-16 -mt-16 opacity-30"></div>
           <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-2">إجمالي الوردية</p>
              <h3 className="text-6xl font-display font-black tracking-tighter">{formData.operatingHours}<span className="text-xl font-bold opacity-30 mr-2">HR</span></h3>
           </div>
           <div className="mt-8 pt-8 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></div>
                 <span className="text-[10px] font-black uppercase opacity-60">محسوب تلقائياً</span>
              </div>
              <Clock size={24} className="opacity-20 group-hover:rotate-12 transition-transform" />
           </div>
        </div>
      </div>
    </div>
  );

  const renderFuel = () => (
    <div className="space-y-10 py-4">
      <StepHeader title="إدارة الوقود والديزل" subtitle="رصد الاستهلاك والمخزون الاستراتيجي" icon={<Fuel size={32} />} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">الرصيد الافتتاحي</label>
            <input type="number" name="previousFuelBalance" value={formData.previousFuelBalance} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold" />
         </div>
         <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">المضاف اليوم</label>
            <input type="number" name="fuelAdded" value={formData.fuelAdded} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold text-lg" />
         </div>
         <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">مستلم (البلدية)</label>
            <input type="number" name="fuelFromMunicipality" value={formData.fuelFromMunicipality} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold" />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <div className="p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-[40px] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-primary-600/10 blur-[60px] rounded-full"></div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">الرصيد الختامي المتوقع</p>
            <div className="flex items-baseline gap-2">
               <h3 className="text-5xl font-display font-black text-primary-400">{formData.currentFuelBalance}</h3>
               <span className="text-lg font-bold opacity-30">لتر</span>
            </div>
            <div className="mt-8 flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 w-fit px-4 py-1.5 rounded-full">
               <Calculator size={14} /> حساب ذكي
            </div>
         </div>
         <div className="grid grid-cols-2 gap-6">
            <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الاستهلاك (المقدر)</p>
               <p className="text-xl font-black text-slate-900 dark:text-white">{formData.fuelConsumed} <span className="text-xs opacity-40">لتر</span></p>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الفوارق / الأعطال</p>
               <input type="number" name="fuelDifference" value={formData.fuelDifference} onChange={handleInputChange} className="bg-transparent border-none p-0 text-xl font-black w-full text-rose-500" />
            </div>
         </div>
      </div>
    </div>
  );

  const renderWater = () => (
    <div className="space-y-10 py-4">
      <StepHeader title="إحصائيات إنتاج المياه" subtitle="كفاءة الغواطس وأنظمة الفلترة" icon={<Droplet size={32} />} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <div className="space-y-6">
            <div className="space-y-3">
               <label className="text-xs font-black text-slate-400 uppercase tracking-widest">إنتاج الغاطس (كوب / ساعة)</label>
               <input type="number" name="submersibleProduction" value={formData.submersibleProduction} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold" />
            </div>
            <div className="space-y-3">
               <label className="text-xs font-black text-slate-400 uppercase tracking-widest">المنتج النهائي (كوب / ساعة)</label>
               <input type="number" name="afterFilterProduction" value={formData.afterFilterProduction} onChange={handleInputChange} className="input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-bold" />
            </div>
         </div>
         <div className="grid grid-cols-1 gap-4">
            <div className="p-8 bg-primary-600 rounded-[32px] text-white shadow-xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16"></div>
               <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">إجمالي الإنتاج اليومي</p>
               <div className="flex items-baseline gap-2">
                  <h3 className="text-5xl font-display font-black">{formData.dailyProduction}</h3>
                  <span className="text-lg font-bold opacity-40">كوب</span>
               </div>
            </div>
            <div className={`p-6 rounded-[32px] border-2 transition-all flex items-center justify-between ${formData.wastePercentage > 40 ? 'bg-rose-500/5 border-rose-500/20 text-rose-600' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'}`}>
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">نسبة الفاقد (العادم)</p>
                  <p className="text-2xl font-black mt-1">{formData.wastePercentage.toFixed(1)}%</p>
               </div>
               <Gauge size={32} className="opacity-20" />
            </div>
         </div>
      </div>
    </div>
  );

  const renderTests = () => (
    <div className="space-y-10 py-4">
      <StepHeader title="الفحوصات المخبرية" subtitle="مراقبة الجودة والمعايير الصحية" icon={<Beaker size={32} />} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
         {[
           { name: 'tdsDesalinated', label: 'TDS مياه محلاة', color: 'text-primary-600' },
           { name: 'tdsWell', label: 'TDS بئر خام', color: 'text-slate-600' },
           { name: 'tdsWaste', label: 'TDS العادم', color: 'text-rose-600' },
           { name: 'phAfterDesalination', label: 'PH بعد التحلية', color: 'text-emerald-600' },
           { name: 'phSubmersible', label: 'PH مياه الغاطس', color: 'text-amber-600' },
           { name: 'freeChlorine', label: 'الكلور الحر', color: 'text-sky-600' },
         ].map((field) => (
            <div key={field.name} className="space-y-3">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{field.label}</label>
               <input 
                 type="text" 
                 name={field.name} 
                 value={formData[field.name]} 
                 onChange={handleInputChange} 
                 className={`input-field h-14 bg-slate-50 dark:bg-white/5 border-none font-black text-center text-lg ${field.color}`} 
               />
            </div>
         ))}
      </div>
      <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 flex items-center gap-4">
         <ShieldCheck size={24} className="text-emerald-500 shrink-0" />
         <p className="text-xs font-bold text-slate-500 leading-relaxed">المعايير المعتمدة لـ TDS المياه المحلاة هي (150-250)، يرجى مراجعة محطة التحلية عند الانحراف</p>
      </div>
    </div>
  );

  const renderEntities = () => (
    <div className="space-y-10 py-4">
      <StepHeader title="توزيع المياه والجهات" subtitle="إدارة حصص المستفيدين والسيارات" icon={<Users size={32} />} />
      
      <div className="flex justify-between items-center px-4 py-4 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
         <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white">سجل التوزيع اليومي</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">أضف الجهات التي تم تعبئتها اليوم</p>
         </div>
         <button 
           onClick={() => setFormData(p => ({ ...p, entities: [...p.entities, { id: Date.now().toString(36), name: '', quantity: 0, cars: 0 }] }))}
           className="p-3 bg-primary-600 text-white rounded-2xl shadow-xl shadow-primary-500/20 hover:scale-110 active:scale-95 transition-all"
         >
            <Plus size={24} />
         </button>
      </div>

      <div className="space-y-4 max-h-[450px] overflow-y-auto custom-scrollbar pr-2">
         <AnimatePresence mode="popLayout">
           {formData.entities.length === 0 ? (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-white/5 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-white/5">
                <Users size={48} className="opacity-10 mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">لا توجد جهات مسجلة</p>
             </motion.div>
           ) : (
             formData.entities.map((en, idx) => (
               <motion.div 
                 key={en.id} 
                 initial={{ opacity: 0, x: -20 }} 
                 animate={{ opacity: 1, x: 0 }} 
                 exit={{ opacity: 0, scale: 0.9 }}
                 className="p-6 bg-white dark:bg-white/5 rounded-[32px] border border-slate-100 dark:border-white/10 shadow-sm flex flex-col md:flex-row gap-6 items-center group"
               >
                 <div className="flex-1 w-full space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mr-2">الجهة المستلمة</label>
                    <input type="text" value={en.name} onChange={e => setFormData(p => ({ ...p, entities: p.entities.map(it => it.id === en.id ? { ...it, name: e.target.value } : it) }))} className="input-field h-12 bg-slate-50 dark:bg-white/5 border-none font-bold" />
                 </div>
                 <div className="w-full md:w-32 space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mr-2">الكمية (كوب)</label>
                    <input type="number" value={en.quantity} onChange={e => setFormData(p => ({ ...p, entities: p.entities.map(it => it.id === en.id ? { ...it, quantity: Number(e.target.value) } : it) }))} className="input-field h-12 bg-slate-50 dark:bg-white/5 border-none font-bold" />
                 </div>
                 <div className="w-full md:w-28 space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mr-2">السيارات</label>
                    <input type="number" value={en.cars} onChange={e => setFormData(p => ({ ...p, entities: p.entities.map(it => it.id === en.id ? { ...it, cars: Number(e.target.value) } : it) }))} className="input-field h-12 bg-slate-50 dark:bg-white/5 border-none font-bold" />
                 </div>
                 <button onClick={() => setFormData(p => ({ ...p, entities: p.entities.filter(it => it.id !== en.id) }))} className="mt-6 md:mt-0 p-3 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all">
                    <Trash2 size={20} />
                 </button>
               </motion.div>
             ))
           )}
         </AnimatePresence>
      </div>

      {formData.entities.length > 0 && (
         <div className="flex justify-between items-center p-8 bg-slate-900 text-white rounded-[40px] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600 blur-[60px] opacity-20 -mr-16 -mt-16"></div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">إجمالي التوزيع الموثق</p>
               <h3 className="text-3xl font-display font-black text-primary-400">{formData.bottledWater} <span className="text-sm font-bold opacity-30">كوب</span></h3>
            </div>
            <div className="flex gap-4">
               <div className="text-right border-r border-white/10 pr-4">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-30">السيارات</p>
                  <p className="text-xl font-black">{formData.entities.reduce((s, e) => s + Number(e.cars || 0), 0)}</p>
               </div>
               <div className="text-right border-r border-white/10 pr-4">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-30">المتوسط</p>
                  <p className="text-xl font-black">{formData.entities.reduce((s, e) => s + Number(e.cars || 0), 0) > 0 ? (formData.bottledWater / formData.entities.reduce((s, e) => s + Number(e.cars || 0), 0)).toFixed(2) : 0}</p>
               </div>
            </div>
         </div>
      )}
    </div>
  );

  const renderReview = () => (
    <div className="space-y-10 py-4">
       <StepHeader title="المراجعة النهائية والاعتماد" subtitle="تأكيد سلامة البيانات قبل الحفظ" icon={<ShieldCheck size={32} />} />
       
       {validationResult && validationResult.warnings.length > 0 && (
          <div className="space-y-3">
            {validationResult.warnings.map((warning, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center gap-4 text-amber-700 dark:text-amber-400">
                 <AlertCircle size={24} className="shrink-0" />
                 <p className="text-sm font-bold">{warning}</p>
              </motion.div>
            ))}
          </div>
       )}

       {validationResult && validationResult.errors.length > 0 && (
          <div className="space-y-3">
            {validationResult.errors.map((error, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center gap-4 text-rose-700 dark:text-rose-400">
                 <AlertCircle size={24} className="shrink-0" />
                 <p className="text-sm font-bold">{error}</p>
              </motion.div>
            ))}
          </div>
       )}

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: 'إجمالي ساعات التشغيل', value: formData.operatingHours, unit: 'ساعة', icon: <Clock />, color: 'text-amber-600' },
            { label: 'استهلاك الوقود', value: formData.fuelConsumed, unit: 'لتر', icon: <Fuel />, color: 'text-purple-600' },
            { label: 'إنتاج المياه اليومي', value: formData.dailyProduction, unit: 'كوب', icon: <Droplet />, color: 'text-primary-600' },
            { label: 'المياه المعبأة', value: formData.bottledWater, unit: 'كوب', icon: <Activity />, color: 'text-emerald-600' },
          ].map((item, idx) => (
            <div key={idx} className="p-8 bg-slate-50 dark:bg-white/[0.03] rounded-[32px] border border-slate-100 dark:border-white/5 flex items-center justify-between">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{item.label}</p>
                  <h4 className={`text-3xl font-display font-black ${item.color}`}>{item.value} <span className="text-xs opacity-40">{item.unit}</span></h4>
               </div>
               <div className={`opacity-20 ${item.color}`}>{React.cloneElement(item.icon, { size: 40 })}</div>
            </div>
          ))}
       </div>

       <div className="p-8 bg-primary-600/5 rounded-[32px] border border-primary-500/10 flex gap-4">
          <Info className="text-primary-500 shrink-0" size={24} />
          <p className="text-sm font-bold text-slate-500 leading-relaxed">بالضغط على زر الحفظ، سيتم ترحيل البيانات إلى قاعدة البيانات السحابية مع تسجيل جميع التغييرات</p>
       </div>
    </div>
  );

  const renderStep = () => {
    switch(currentStep) {
      case 1: return renderGeneral();
      case 2: return renderGenerator();
      case 3: return renderFuel();
      case 4: return renderWater();
      case 5: return renderTests();
      case 6: return renderEntities();
      case 7: return renderReview();
      default: return renderGeneral();
    }
  };

  if (loading) return <LoadingScreen message="جاري تجهيز بيانات التقرير..." />;

  if (isMaintenance && !isEdit) return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-10 text-center">
       <div className="w-24 h-24 bg-rose-500/10 text-rose-600 rounded-3xl flex items-center justify-center animate-pulse">
          <ShieldCheck size={48} />
       </div>
       <div className="space-y-4 max-w-md">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">وضع الصيانة مفعل</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">نعتذر، تم تعليق إدخال التقارير الميدانية مؤقتاً لإجراء صيانة دورية للنظام</p>
          <button onClick={() => navigate('/dashboard')} className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black transition-all hover:scale-105 active:scale-95">العودة للصفحة الرئيسية</button>
       </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-10 animate-in fade-in duration-700">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-3 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
             <ChevronRight size={24} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
               <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></div>
               <span className="text-[10px] font-black text-primary-600 uppercase tracking-widest">{isEdit ? 'تعديل السجل' : 'تقرير تشغيل جديد'}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight">
              {isEdit ? 'تحديث بيانات التقرير' : 'تسجيل وردية تشغيل وضخ'}
            </h1>
          </div>
        </div>
      </div>

      {/* Horizontal Stepper */}
      <div className="glass-card p-4 border-white/40 dark:border-white/5 overflow-x-auto hide-scrollbar">
        <div className="flex items-center gap-2 min-w-max">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-300 group ${
                  currentStep === step.id 
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl' 
                  : currentStep > step.id
                    ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                    : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-center w-6 h-6">
                   {currentStep > step.id ? <CheckCircle size={20} /> : step.icon}
                </div>
                <span className="text-xs font-black whitespace-nowrap">{step.name}</span>
              </button>
              {index < steps.length - 1 && <ChevronLeft size={16} className="text-slate-300 dark:text-slate-700" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main Form Card */}
      <div className="glass-card p-8 md:p-12 border-white/40 dark:border-white/5 shadow-2xl shadow-slate-200/50 dark:shadow-none min-h-[600px] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/[0.02] blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Footer */}
      <div className="flex justify-between items-center sticky bottom-6 z-20">
        <button 
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} 
          disabled={currentStep === 1}
          className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-3xl font-black shadow-xl border border-slate-100 dark:border-white/10 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
        >
          <ChevronRight size={20} /> السابق
        </button>

        {currentStep < steps.length ? (
          <button 
            onClick={() => setCurrentStep(Math.min(steps.length, currentStep + 1))} 
            className="px-10 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            التالي <ChevronLeft size={20} />
          </button>
        ) : (
          <button 
            onClick={() => setShowConfirm(true)} 
            className="px-12 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-3xl font-black shadow-2xl shadow-primary-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <Save size={22} /> اعتماد وحفظ التقرير
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={saveReport}
        title="اعتماد التقرير النهائي"
        message="هل أنت متأكد من حفظ هذا التقرير؟ سيتم تحديث الأرصدة والسجلات بناءً على البيانات المدخلة."
        type="success"
        confirmText="نعم، احفظ الآن"
        cancelText="مراجعة"
      />
    </div>
  );
};

export default AddReport;
