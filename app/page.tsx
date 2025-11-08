import Link from "next/link";
import { ArrowRight, Upload, FileText, TrendingDown } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Biologic Decision Support System
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Reduce biologic costs while maintaining clinical outcomes through intelligent,
          evidence-based therapy optimization
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-12">
        <div className="card">
          <Upload className="w-12 h-12 text-primary-600 mb-4" />
          <h3 className="mb-2">Upload Data</h3>
          <p className="text-gray-600 mb-4">
            Upload formulary sheets, claims data, and clinical evidence through simple CSV/PDF uploads
          </p>
          <Link href="/admin" className="text-primary-600 hover:text-primary-700 font-medium flex items-center">
            Go to Admin <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        <div className="card">
          <FileText className="w-12 h-12 text-primary-600 mb-4" />
          <h3 className="mb-2">Quick Assessment</h3>
          <p className="text-gray-600 mb-4">
            Simplified patient assessment form with automatic data population and quadrant classification
          </p>
          <Link href="/assess" className="text-primary-600 hover:text-primary-700 font-medium flex items-center">
            Start Assessment <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        <div className="card">
          <TrendingDown className="w-12 h-12 text-primary-600 mb-4" />
          <h3 className="mb-2">Cost Savings</h3>
          <p className="text-gray-600 mb-4">
            Get 1-3 evidence-based recommendations for dose reduction or formulary-preferred switches
          </p>
          <Link href="/patients" className="text-primary-600 hover:text-primary-700 font-medium flex items-center">
            View Patients <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>

      <div className="card max-w-3xl mx-auto">
        <h2 className="mb-4">How It Works</h2>
        <ol className="space-y-4">
          <li className="flex">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold mr-4">
              1
            </span>
            <div>
              <h4 className="font-semibold mb-1">Select Patient & Input Assessment</h4>
              <p className="text-gray-600">
                Choose patient, enter current biologic(s), indication, contraindications, DLQI score, and stability duration
              </p>
            </div>
          </li>
          <li className="flex">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold mr-4">
              2
            </span>
            <div>
              <h4 className="font-semibold mb-1">Automatic Classification</h4>
              <p className="text-gray-600">
                System auto-pulls claims, health plan, formulary tiers, and places patient in stability/formulary matrix
              </p>
            </div>
          </li>
          <li className="flex">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold mr-4">
              3
            </span>
            <div>
              <h4 className="font-semibold mb-1">Evidence-Based Recommendations</h4>
              <p className="text-gray-600">
                Receive 1-3 cost-saving options with clinical rationale, evidence citations, and detailed cost analysis
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
