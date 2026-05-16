import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, getDocs, doc, getDoc, updateDoc, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
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

      // التحقق من صحة البيانات باستخدام القيم المحسوبة
      const validation = validateReport(calculated);
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
         <p className="text-xs font-bold text-slate-500 leading-relaxed">المعايير المعتمدة لـ TDS المياه المحلاة هي (150-250)، يرجى مراجعة محطة ا�[...]
