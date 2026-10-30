import { useEffect } from 'react';
import { useFahrplanStore } from './stores/fahrplanStore';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import NetworkMap from './components/NetworkMap';
import LineEditor from './components/LineEditor';
import CompareView from './components/CompareView';
import InfrastructurePanel from './components/InfrastructurePanel';

function App() {
  const {
    loading, error, activeYear, compareYear,
    viewMode, selectedLine,
    loadData,
  } = useFahrplanStore();

  useEffect(() => {
    loadData(activeYear);
  }, [activeYear, loadData]);

  useEffect(() => {
    if (compareYear) {
      loadData(compareYear);
    }
  }, [compareYear, loadData]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Fehler</h2>
          <p className="text-gray-700">{error}</p>
          <button
            onClick={() => loadData(activeYear)}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
                <p className="text-gray-600 text-lg">Fahrplandaten werden geladen...</p>
                <p className="text-gray-400 text-sm mt-2">Fahrplan {activeYear}</p>
              </div>
            </div>
          ) : (
            <>
              {viewMode === 'compare' ? (
                <CompareView />
              ) : (
                <>
                  <div className="flex-1 relative h-full w-full">
                    <NetworkMap />
                  </div>
                  {viewMode === 'editor' && selectedLine && (
                    <div className="w-[480px] border-l border-gray-200 flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto">
                        <LineEditor />
                      </div>
                      <div className="border-t border-gray-200 max-h-[40%] overflow-y-auto">
                        <InfrastructurePanel />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
