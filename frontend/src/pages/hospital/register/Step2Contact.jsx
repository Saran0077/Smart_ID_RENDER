import { useEffect, useState } from "react";
import { usePatientRegistration } from "../../../context/PatientRegistrationContext";
import { useNavigate } from "react-router-dom";

export default function Step2Contact() {
    const { data, updateSection, markStepComplete, canAccessStep, getFirstIncompleteStepPath } = usePatientRegistration();
    const navigate = useNavigate();
    const [error, setError] = useState("");

    useEffect(() => {
        if (!canAccessStep("contact")) {
            navigate(getFirstIncompleteStepPath(), { replace: true });
        }
    }, [canAccessStep, getFirstIncompleteStepPath, navigate]);

    const submit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const values = Object.fromEntries(formData.entries());

        if (!values.phone?.trim() || !values.address?.trim() || !values.emergencyName?.trim() || !values.emergencyPhone?.trim()) {
            setError("Complete all contact details before continuing.");
            return;
        }

        updateSection("contact", {
            phone: values.phone.trim(),
            address: values.address.trim(),
            emergencyName: values.emergencyName.trim(),
            emergencyPhone: values.emergencyPhone.trim(),
        });
        markStepComplete("contact", true);
        navigate("/hospital/register/medical");
    };

    const goBack = () => {
        navigate("/hospital/register");
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Contact Details</h3>
                <p className="text-sm text-slate-500">How we and doctors can reach the patient.</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
                {error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                    </p>
                )}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                    <input
                        name="phone"
                        type="tel"
                        defaultValue={data.contact.phone}
                        placeholder="+1 (555) 000-0000"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Address</label>
                    <textarea
                        name="address"
                        defaultValue={data.contact.address}
                        placeholder="Enter patient address"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[96px]"
                        required
                    />
                </div>

                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-6">
                    <label className="text-xs font-bold text-slate-500 uppercase">Emergency Contact Name</label>
                    <input
                        name="emergencyName"
                        defaultValue={data.contact.emergencyName}
                        placeholder="Full Name"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Emergency Contact Phone</label>
                    <input
                        name="emergencyPhone"
                        type="tel"
                        defaultValue={data.contact.emergencyPhone}
                        placeholder="Phone Number"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        required
                    />
                </div>

                <div className="pt-6 flex gap-4">
                    <button
                        type="button"
                        onClick={goBack}
                        className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                        Back
                    </button>
                    <button
                        type="submit"
                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                        Continue to Medical Info
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                </div>
            </form>
        </div>
    );
}
