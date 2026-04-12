import { useState } from "react";
import { usePatientRegistration } from "../../../context/PatientRegistrationContext";
import { useNavigate } from "react-router-dom";

export default function Step1Personal() {
    const { data, updateSection, markStepComplete } = usePatientRegistration();
    const navigate = useNavigate();
    const [error, setError] = useState("");

    const submit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const values = Object.fromEntries(formData.entries());

        if (!values.fullName?.trim() || !values.dob || !values.govtId?.trim() || !values.gender) {
            setError("Complete all personal details before continuing.");
            return;
        }

        updateSection("personal", {
            fullName: values.fullName.trim(),
            dob: values.dob,
            govtId: values.govtId.trim(),
            gender: values.gender,
        });
        markStepComplete("personal", true);
        navigate("/hospital/register/contact");
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Personal Information</h3>
                <p className="text-sm text-slate-500">Legal name and identification as per government records.</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
                {error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                        <input
                            name="fullName"
                            defaultValue={data.personal.fullName}
                            placeholder="Enter full name"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Date of Birth</label>
                        <input
                            name="dob"
                            type="date"
                            defaultValue={data.personal.dob}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Government ID (Passport / SSN)</label>
                    <input
                        name="govtId"
                        defaultValue={data.personal.govtId}
                        placeholder="ID Number"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Gender</label>
                    <div className="flex gap-4">
                        {['Male', 'Female', 'Other'].map(opt => (
                            <label key={opt} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-900/20 has-[:checked]:border-emerald-500">
                                <input
                                    type="radio"
                                    name="gender"
                                    value={opt.toLowerCase()}
                                    defaultChecked={data.personal.gender === opt.toLowerCase()}
                                    className="hidden"
                                    required
                                />
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="pt-6">
                    <button
                        type="submit"
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                        Continue to Contact Details
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                </div>
            </form>
        </div>
    );
}
