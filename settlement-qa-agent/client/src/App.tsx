import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import IntroAnimation from './components/IntroAnimation';

function App() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <>
      {showIntro && <IntroAnimation onComplete={() => setShowIntro(false)} />}
      <Dashboard />
    </>
  );
}

export default App;
