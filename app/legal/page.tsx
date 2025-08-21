export default function LegalPage() {
  return (
    <div className="min-h-screen p-8 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">
            📄 Legal Documents
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Official adoption certificates documenting the loving homes found for our cherished stuffed companions
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                📋 Alex's Adoption Certificate
              </h2>
              <p className="text-gray-600 mt-1">Official documentation of adoption</p>
            </div>
            <div className="p-6">
              <iframe
                src="/legal/adoption-certificates/alex.html"
                width="100%"
                height="600"
                className="border-0 rounded-lg shadow-inner"
                title="Alex's Stuffed Animal Adoption Certificate"
              />
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-b">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                📜 Sid's Adoption Certificate
              </h2>
              <p className="text-gray-600 mt-1">Official documentation of adoption</p>
            </div>
            <div className="p-6">
              <iframe
                src="/legal/adoption-certificates/sid.html"
                width="100%"
                height="600"
                className="border-0 rounded-lg shadow-inner"
                title="Sid's Stuffed Animal Adoption Certificate"
              />
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 rounded-full text-gray-600">
            <span>🧸</span>
            <span>Ensuring proper care and endless cuddles since 2025 ;)</span>
            <span>🧸</span>
          </div>
        </div>
      </div>
    </div>
  );
}