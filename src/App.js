import React, { useState, useEffect } from 'react';
import { QrCode, Users, UserPlus, Home, Activity, Award, Share2 } from 'lucide-react';
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  doc, 
  deleteDoc,
  query,
  where,
  onSnapshot 
} from 'firebase/firestore';

const QRCodeGenerator = ({ value, size = 200 }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
    setQrCodeUrl(qrUrl);
  }, [value, size]);

  return (
    <div className="inline-block">
      {qrCodeUrl ? (
        <img src={qrCodeUrl} alt="QR Code" className="rounded-lg" />
      ) : (
        <div className="flex items-center justify-center bg-gray-200 rounded-lg" style={{ width: size, height: size }}>
          <QrCode size={size / 2} className="text-gray-400" />
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [view, setView] = useState('home');
  const [guests, setGuests] = useState([]);
  const [currentGuest, setCurrentGuest] = useState(null);
  const [polls, setPolls] = useState([]);
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordError, setShowPasswordError] = useState(false);
  const ADMIN_PASSWORD = 'soci@lAlch3mist!';

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    important: '',
    goal: ''
  });

// Persist authentication
useEffect(() => {
  const savedAuth = sessionStorage.getItem('adminAuth');
  if (savedAuth === 'true') {
    setIsAuthenticated(true);
  }
}, []);

useEffect(() => {
  if (isAuthenticated) {
    sessionStorage.setItem('adminAuth', 'true');
  } else {
    sessionStorage.removeItem('adminAuth');
  }
}, [isAuthenticated]);

  // Load data from Firebase on mount
 useEffect(() => {
  // Handle QR code scanning URLs
  const path = window.location.pathname;
  if (path.startsWith('/guest/')) {
    const guestIdFromUrl = path.replace('/guest/', '');
    console.log('Looking for guest with ID:', guestIdFromUrl);
    
    // Find guest by guestId
    const guest = guests.find(g => g.guestId === guestIdFromUrl);
    if (guest) {
      console.log('Found guest:', guest.name);
      setCurrentGuest(guest);
      setView('interactive');
    } else {
      console.log('Guest not found, available guests:', guests.length);
    }
  }
}, [guests]);

  // Real-time listeners for data updates
  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
      const eventData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventData);
      if (eventData.length > 0 && !selectedEventId) {
        setSelectedEventId(eventData[0].id);
      }
      setLoading(false);
    });

    const unsubGuests = onSnapshot(collection(db, 'guests'), (snapshot) => {
      const guestData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGuests(guestData);
    });

    const unsubPolls = onSnapshot(collection(db, 'polls'), (snapshot) => {
      const pollData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPolls(pollData);
    });

    return () => {
      unsubEvents();
      unsubGuests();
      unsubPolls();
    };
  }, [selectedEventId]);

  const loadEvents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'events'));
      const eventData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (eventData.length === 0) {
        // Create default event if none exists
        const defaultEvent = {
          name: 'Speed Dating Night',
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'events'), defaultEvent);
        setEvents([{ id: docRef.id, ...defaultEvent }]);
        setSelectedEventId(docRef.id);
      } else {
        setEvents(eventData);
        setSelectedEventId(eventData[0].id);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      window.alert('Error loading events. Check console.');
    }
  };

  const loadGuests = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'guests'));
      const guestData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGuests(guestData);
    } catch (error) {
      console.error('Error loading guests:', error);
    }
  };

  const loadPolls = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'polls'));
      const pollData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPolls(pollData);
    } catch (error) {
      console.error('Error loading polls:', error);
    }
  };

  const handleRegister = async () => {
  if (!formData.name || !formData.age || !selectedEventId) {
    window.alert('Please fill in required fields and select an event');
    return;
  }

  // Prevent multiple submissions
  if (registering) return;
  
  setRegistering(true);

  try {
    const guestId = `GUEST-${Date.now()}`;
    const qrCode = `${window.location.origin}/guest/${guestId}`;
    
    const newGuest = {
      name: formData.name,
      age: formData.age,
      important: formData.important,
      goal: formData.goal,
      eventId: selectedEventId,
      registeredAt: new Date().toISOString(),
      qrCode: qrCode,
      guestId: guestId,
      points: 0,
      activities: []
    };

    const guestRef = await addDoc(collection(db, 'guests'), newGuest);
    const guestWithId = { id: guestRef.id, ...newGuest };

    // Calculate max votes
    const eventGuestsCount = guests.filter(g => g.eventId === selectedEventId).length + 1;
    const maxVotes = Math.max(1, eventGuestsCount - 1);

    // Create poll for this guest
    const newPoll = {
      guestId: guestRef.id,
      eventId: selectedEventId,
      guestName: newGuest.name,
      question: `Will you go out with ${newGuest.name}?`,
      options: ['Yes', 'No', 'Maybe', 'Let me think about it'],
      votes: {},
      votedGuests: [],
      maxVotes: maxVotes
    };

    await addDoc(collection(db, 'polls'), newPoll);

    // Update maxVotes for all existing polls in this event
    const eventPolls = polls.filter(p => p.eventId === selectedEventId);
    for (const poll of eventPolls) {
      const pollRef = doc(db, 'polls', poll.id);
      await updateDoc(pollRef, { maxVotes: maxVotes });
    }

    setFormData({ name: '', age: '', important: '', goal: '' });
    setRegistering(false);
    setView('qr-display');
    setCurrentGuest(guestWithId);
  } catch (error) {
    console.error('Error registering guest:', error);
    setRegistering(false);
    window.alert('Error registering guest. Please try again.');
  }
};

  const handleQRScan = (guestId) => {
    const guest = guests.find(g => g.id === guestId);
    if (guest) {
      setCurrentGuest(guest);
      setView('interactive');
    }
  };

  const handleVote = async (pollId, option) => {
  const poll = polls.find(p => p.id === pollId);
  if (!poll) return;

  // Check if already voted
  if (poll.votedGuests?.includes(currentGuest.id)) {
    window.alert('You have already voted on this poll!');
    return;
  }

  try {
    // Optimistic update - show immediately
    setCurrentGuest({
      ...currentGuest,
      points: currentGuest.points + 10,
      activities: [...(currentGuest.activities || []), 'Poll Participation']
    });

    // Update Firebase in background
    const updatedVotes = { ...(poll.votes || {}) };
    updatedVotes[option] = (updatedVotes[option] || 0) + 1;
    const updatedVotedGuests = [...(poll.votedGuests || []), currentGuest.id];

    await Promise.all([
      updateDoc(doc(db, 'polls', pollId), {
        votes: updatedVotes,
        votedGuests: updatedVotedGuests
      }),
      updateDoc(doc(db, 'guests', currentGuest.id), {
        points: currentGuest.points + 10,
        activities: [...(currentGuest.activities || []), 'Poll Participation']
      })
    ]);

  } catch (error) {
    console.error('Error voting:', error);
    window.alert('Error submitting vote. Please try again.');
  }
};

  const createEvent = async () => {
    const newName = prompt('Enter event name:', 'New Event');
    if (!newName) return;

    const newDate = prompt('Enter event date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!newDate) return;

    try {
      const newEvent = {
        name: newName,
        date: newDate,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'events'), newEvent);
      setSelectedEventId(docRef.id);
      window.alert(`Event "${newName}" created successfully!`);
    } catch (error) {
      console.error('Error creating event:', error);
      window.alert('Error creating event. Please try again.');
    }
  };

  const editEvent = async () => {
    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;

    const newName = prompt('Enter new event name:', event.name);
    if (newName === null) return;

    const newDate = prompt('Enter new event date (YYYY-MM-DD):', event.date);
    if (newDate === null) return;

    try {
      const eventRef = doc(db, 'events', selectedEventId);
      await updateDoc(eventRef, {
        name: newName || event.name,
        date: newDate || event.date
      });
      window.alert('Event updated successfully!');
    } catch (error) {
      console.error('Error updating event:', error);
      window.alert('Error updating event. Please try again.');
    }
  };

  const deleteEvent = async () => {
    if (events.length === 1) {
      window.alert('Cannot delete the last event!');
      return;
    }

    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;

    const eventGuestsCount = guests.filter(g => g.eventId === selectedEventId).length;
    const confirmMsg = eventGuestsCount > 0
      ? `Are you sure you want to delete "${event.name}"? This will also remove ${eventGuestsCount} guest(s) and their data.`
      : `Are you sure you want to delete "${event.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      // Delete event
      await deleteDoc(doc(db, 'events', selectedEventId));

      // Delete associated guests
      const eventGuests = guests.filter(g => g.eventId === selectedEventId);
      for (const guest of eventGuests) {
        await deleteDoc(doc(db, 'guests', guest.id));
      }

      // Delete associated polls
      const eventPolls = polls.filter(p => p.eventId === selectedEventId);
      for (const poll of eventPolls) {
        await deleteDoc(doc(db, 'polls', poll.id));
      }

      const remainingEvent = events.find(e => e.id !== selectedEventId);
      setSelectedEventId(remainingEvent.id);
      window.alert('Event deleted successfully!');
    } catch (error) {
      console.error('Error deleting event:', error);
      window.alert('Error deleting event. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Activity className="text-indigo-600 animate-pulse mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-gray-800">Loading...</h2>
          <p className="text-gray-600 mt-2">Connecting to Firebase</p>
        </div>
      </div>
    );
  }

const renderLogin = () => {
  const handleLogin = (e) => {
    e.preventDefault();
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setShowPasswordError(false);
      setAdminPassword('');
    } else {
      setShowPasswordError(true);
      setAdminPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Event Organizer Login</h1>
            <p className="text-gray-600">Enter password to access admin panel</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Admin Password
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  setShowPasswordError(false);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleLogin(e);
                  }
                }}
                className={`w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  showPasswordError ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter password"
                autoFocus
              />
              {showPasswordError && (
                <p className="text-red-500 text-sm mt-2">
                  ❌ Incorrect password. Please try again.
                </p>
              )}
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all transform hover:scale-105"
            >
              Login as Organizer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

  const renderHome = () => {
    const currentEvent = events.find(e => e.id === selectedEventId);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center gap-3">
              <Activity className="text-indigo-600" size={40} />
              {currentEvent ? currentEvent.name : 'Event Hub'}
            </h1>
            {currentEvent && (
              <p className="text-gray-600 mb-2">
                {new Date(currentEvent.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            )}
            <p className="text-gray-500 mb-8">Seamless guest registration and interactive experiences</p>

            <div className="grid md:grid-cols-2 gap-6">
              <button
                onClick={() => setView('register')}
                className="bg-gradient-to-r from-pink-500 to-rose-600 text-white p-8 rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
              >
                <UserPlus size={48} className="mb-4 mx-auto" />
                <h3 className="text-2xl font-bold mb-2">Register as Guest</h3>
                <p className="text-indigo-100">Join the event and get your QR code</p>
              </button>

              <button
                onClick={() => setView('admin')}
                className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-8 rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
              >
                <Users size={48} className="mb-4 mx-auto" />
                <h3 className="text-2xl font-bold mb-2">Admin Dashboard</h3>
                <p className="text-purple-100">Manage guests and view analytics</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRegister = () => {
    const currentEvent = events.find(e => e.id === selectedEventId);

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 p-8">
        <div className="max-w-2xl mx-auto">
          <button
  onClick={handleRegister}
  disabled={registering}
  className={`w-full py-4 rounded-lg font-semibold transition-all transform ${
    registering
      ? 'bg-gray-400 cursor-not-allowed'
      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg hover:scale-105'
  } text-white flex items-center justify-center gap-2`}
>
  {registering ? (
    <>
      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Registering...
    </>
  ) : (
    'Complete Registration'
  )}
</button>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6 pb-6 border-b border-gray-200">
              <h2 className="text-3xl font-bold text-gray-800 mb-4">Guest Registration</h2>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Event *</label>
                <select
                  value={selectedEventId || ''}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {events.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.name} - {new Date(event.date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              {currentEvent && (
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="font-semibold text-gray-800">{currentEvent.name}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(currentEvent.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
            </div>

            <h3 className="text-xl font-bold text-gray-800 mb-6">Your Information</h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Age *</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Your age"
                  min="18"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">What is most important to you right now?</label>
                <textarea
                  value={formData.important}
                  onChange={(e) => setFormData({ ...formData, important: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Share what matters most to you..."
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">What are you hoping to achieve from tonight's event?</label>
                <textarea
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Tell us about your goals for tonight..."
                  rows="3"
                />
              </div>

              <button
  onClick={handleRegister}
  disabled={registering}
  className={`w-full py-4 rounded-lg font-semibold transition-all relative overflow-hidden ${
    registering
      ? 'bg-gray-400 cursor-not-allowed'
      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg hover:scale-105'
  } text-white`}
>
  {registering && (
    <div className="absolute top-0 left-0 h-1 bg-white animate-pulse" 
         style={{ width: '100%', animation: 'progress 2s ease-in-out' }}>
    </div>
  )}
  <div className="flex items-center justify-center gap-2">
    {registering ? (
      <>
        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Registering... Please wait
      </>
    ) : (
      'Complete Registration'
    )}
  </div>
</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQRDisplay = () => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Registration Successful!</h2>
            <p className="text-gray-600">Welcome, {currentGuest?.name}</p>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-xl mb-6">
            <p className="text-sm text-gray-600 mb-4">Your Personal QR Code</p>
            <div className="bg-white p-6 rounded-lg inline-block shadow-md">
              <QRCodeGenerator value={currentGuest?.qrCode} size={200} />
              <p className="mt-4 font-mono text-sm text-gray-600">{currentGuest?.qrCode}</p>
            </div>
            <p className="text-sm text-gray-500 mt-4">Scan this code at the event to access interactive features</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setView('interactive')}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Go to Interactive Page
            </button>
            <button
              onClick={() => setView('home')}
              className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInteractive = () => {
    const availablePolls = polls.filter(p => p.eventId === currentGuest.eventId && p.guestId !== currentGuest.id);

    return (
<div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-8">
  <div className="max-w-4xl mx-auto">

          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold text-gray-800">Welcome, {currentGuest?.name}!</h2>
                <p className="text-gray-600">Age: {currentGuest?.age}</p>
              </div>
              <div className="text-center bg-gradient-to-br from-yellow-400 to-orange-500 text-white px-6 py-3 rounded-xl">
                <Award size={24} className="mx-auto mb-1" />
                <p className="text-2xl font-bold">{currentGuest?.points}</p>
                <p className="text-xs">Points</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <QrCode className="text-blue-600 mb-2" size={24} />
                <p className="text-sm text-gray-600">QR Code</p>
                <p className="font-mono text-xs text-gray-500">{currentGuest?.qrCode}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <Activity className="text-green-600 mb-2" size={24} />
                <p className="text-sm text-gray-600">Activities</p>
                <p className="font-bold text-lg">{currentGuest?.activities?.length || 0}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <Share2 className="text-purple-600 mb-2" size={24} />
                <p className="text-sm text-gray-600">Engagement</p>
                <p className="font-bold text-lg">{currentGuest?.points > 0 ? 'Active' : 'New'}</p>
              </div>
            </div>
          </div>

          {availablePolls.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <Users className="mx-auto mb-4 text-gray-400" size={64} />
              <h3 className="text-2xl font-bold text-gray-800 mb-2">No Polls Available Yet</h3>
              <p className="text-gray-600">Wait for other guests to register to see their polls!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {availablePolls.map((poll) => {
  const hasCurrentGuestVoted = poll.votedGuests?.includes(currentGuest.id);

                return (
                  <div key={poll.id} className="bg-white rounded-2xl shadow-xl p-8">
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">{poll.question}</h3>
                    <p className="text-sm text-gray-500 mb-6">
  {hasCurrentGuestVoted ? (
    <span className="text-green-600 font-semibold">✓ You have voted on this poll</span>
  ) : (
    <span className="text-gray-600">Vote to earn 10 points!</span>
  )}
</p>

                    <div className="space-y-3">
  {poll.options.map((option, idx) => {
    return (
      <button
        key={idx}
        onClick={() => handleVote(poll.id, option)}
        disabled={hasCurrentGuestVoted}
        className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
          hasCurrentGuestVoted
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : 'border-gray-200 hover:border-indigo-500 hover:bg-indigo-50'
        }`}
      >
        <span className="font-semibold text-gray-700">{option}</span>
      </button>
    );
  })}
</div>

                    <p className="text-sm text-gray-500 mt-4 text-center">
  {hasCurrentGuestVoted
    ? 'Thank you for voting! +10 points earned'
    : 'Cast your vote above'}
</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAdmin = () => {
    const currentEvent = events.find(e => e.id === selectedEventId);
    const eventGuests = guests.filter(g => g.eventId === selectedEventId);
    const selectedGuest = selectedGuestId ? guests.find(g => g.id === selectedGuestId) : null;
    const selectedPoll = selectedGuestId ? polls.find(p => p.guestId === selectedGuestId) : null;

    if (selectedGuest && selectedPoll) {
      const totalVotes = Object.values(selectedPoll.votes || {}).reduce((a, b) => a + b, 0);
      const voteData = Object.entries(selectedPoll.votes || {}).map(([option, count]) => ({
        option,
        count,
        percentage: totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0
      })).sort((a, b) => b.count - a.count);

      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => setSelectedGuestId(null)}
              className="mb-6 text-gray-600 hover:text-gray-800 flex items-center gap-2"
            >
              ← Back to Dashboard
            </button>

            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-2xl shadow-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-1">{currentEvent ? currentEvent.name : 'Event'}</h2>
              <p className="text-indigo-100">
                {currentEvent && new Date(currentEvent.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-white">{selectedGuest.name.charAt(0)}</span>
                </div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">{selectedGuest.name}</h2>
                <p className="text-gray-600">Age: {selectedGuest.age}</p>
                {selectedGuest.important && (
                  <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 mb-1">What's important:</p>
                    <p className="text-gray-600">{selectedGuest.important}</p>
                  </div>
                )}
                {selectedGuest.goal && (
                  <div className="mt-3 bg-purple-50 p-4 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Tonight's goal:</p>
                    <p className="text-gray-600">{selectedGuest.goal}</p>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Poll Question</h3>
                <p className="text-lg text-gray-700 bg-purple-50 p-4 rounded-lg">{selectedPoll.question}</p>
              </div>

              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-800">Vote Results</h3>
                  <span className="bg-indigo-100 text-indigo-800 px-4 py-2 rounded-full font-semibold">
                    Total: {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                  </span>
                </div>

                {totalVotes === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No votes received yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {voteData.map((vote, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-6 relative overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-100 to-purple-100 transition-all"
                          style={{ width: `${vote.percentage}%` }}
                        />
                        <div className="relative flex justify-between items-center">
                          <div>
                            <p className="text-lg font-bold text-gray-800">{vote.option}</p>
                            <p className="text-sm text-gray-600">{vote.percentage}% of votes</p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold text-indigo-600">{vote.count}</p>
                            <p className="text-xs text-gray-500">vote{vote.count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-3 gap-4 pt-6 border-t border-gray-200">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">QR Code</p>
                  <p className="font-mono text-xs text-gray-800">{selectedGuest.qrCode}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Points Earned</p>
                  <p className="text-2xl font-bold text-green-600">{selectedGuest.points}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Age</p>
                  <p className="text-2xl font-bold text-purple-600">{selectedGuest.age}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setView('home')}
            className="mb-6 text-gray-600 hover:text-gray-800 flex items-center gap-2"
          >
            <Home size={20} /> Back to Home
          </button>

          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
  <div className="flex justify-between items-start mb-6">
  <div>
    <h2 className="text-3xl font-bold text-gray-800 mb-2">Admin Dashboard</h2>
    <p className="text-gray-600">Manage your event and view guest analytics</p>
  </div>
  <button
    onClick={() => {
      setIsAuthenticated(false);
      setView('home');
    }}
    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition flex items-center gap-2"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
    Logout
  </button>
</div>

            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xl font-bold mb-2">Event Management</h3>
                  <select
                    value={selectedEventId || ''}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="bg-white text-gray-800 px-4 py-2 rounded-lg font-semibold"
                  >
                    {events.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name} - {new Date(event.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createEvent}
                    className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-50 transition"
                  >
                    + New Event
                  </button>
                  <button
                    onClick={editEvent}
                    className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-50 transition"
                  >
                    Edit Event
                  </button>
                  <button
                    onClick={deleteEvent}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600 transition"
                  >
                    Delete Event
                  </button>
                </div>
              </div>
              {currentEvent && (
                <>
                  <h4 className="text-2xl font-bold mb-2">{currentEvent.name}</h4>
                  <p className="text-indigo-100">
                    {new Date(currentEvent.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl">
                <Users size={32} className="mb-2" />
                <p className="text-3xl font-bold">{eventGuests.length}</p>
                <p className="text-blue-100">Total Guests</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl">
                <Activity size={32} className="mb-2" />
                <p className="text-3xl font-bold">{eventGuests.filter(g => g.points > 0).length}</p>
                <p className="text-green-100">Active Users</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl">
                <Award size={32} className="mb-2" />
                <p className="text-3xl font-bold">{eventGuests.reduce((sum, g) => sum + g.points, 0)}</p>
                <p className="text-purple-100">Total Points</p>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl">
                <Share2 size={32} className="mb-2" />
                <p className="text-3xl font-bold">
                  {polls.filter(p => p.eventId === selectedEventId).reduce((sum, poll) => sum + Object.values(poll.votes || {}).reduce((a, b) => a + b, 0), 0)}
                </p>
                <p className="text-orange-100">Total Votes</p>
              </div>
            </div>

            <h3 className="text-xl font-bold text-gray-800 mb-4">Registered Guests - Click to View Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Age</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">What's Important</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Tonight's Goal</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Votes</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Points</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {eventGuests.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        No guests registered yet for this event
                      </td>
                    </tr>
                  ) : (
                    eventGuests.map((guest) => {
                      const guestPoll = polls.find(p => p.guestId === guest.id);
                      const totalVotes = guestPoll ? Object.values(guestPoll.votes || {}).reduce((a, b) => a + b, 0) : 0;

                      return (
                        <tr key={guest.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-800 font-semibold">{guest.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{guest.age}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                            {guest.important || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                            {guest.goal || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-semibold">
                              {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-semibold">
                              {guest.points}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <button
                              onClick={() => setSelectedGuestId(guest.id)}
                              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition font-semibold"
                            >
                              View Results
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

return (
  <div className="font-sans">
    {view === 'login' && renderLogin()}
    {view === 'home' && renderHome()}
    {view === 'register' && renderRegister()}
    {view === 'qr-display' && renderQRDisplay()}
    {view === 'interactive' && renderInteractive()}
    {view === 'admin' && (isAuthenticated ? renderAdmin() : renderLogin())}
  </div>
 );
};

export default App;