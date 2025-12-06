import React, { useState, useEffect, useRef } from 'react';
import { Wifi, Lock, Unlock, Power, AlertCircle } from 'lucide-react';
import './App.css';

const GateControl = () => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Не підключено');
  const [gateState, setGateState] = useState('closed'); // closed, opening, open, closing
  const [loading, setLoading] = useState(false);
  const clientRef = useRef(null);

  // Унікальний ID для ваших воріт (ЗМІНІТЬ на свій!)
  const GATE_ID = 'roman_zvir_2024';

  // PIN-код захист
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const correctPin = '2015';

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pin === correctPin) {
      setIsUnlocked(true);
      setError('');
    } else {
      setError('Невірний PIN-код');
      setPin('');
      // Трясіння при помилці
      setTimeout(() => setError(''), 2000);
    }
  };

  const handlePinInput = (value) => {
    if (value.length <= 4 && /^\d*$/.test(value)) {
      setPin(value);
      setError('');
    }
  };

  useEffect(() => {
    // Підключення до MQTT через WebSocket
    const connectMQTT = () => {
      try {
        // Використовуємо EMQX брокер (той самий, що й ESP32!)
        const clientId = 'webClient_' + Math.random().toString(16).substr(2, 8);
        console.log('🔌 Створюю MQTT клієнт:', clientId);
        
        const client = new window.Paho.MQTT.Client(
          'broker.emqx.io',
          8084,
          '/mqtt',
          clientId
        );

        client.onConnectionLost = (responseObject) => {
          if (responseObject.errorCode !== 0) {
            setConnected(false);
            setStatus('З\'єднання втрачено');
            console.log('❌ Втрачено з\'єднання:', responseObject.errorMessage);
            setTimeout(connectMQTT, 5000);
          }
        };

        client.onMessageArrived = (message) => {
          console.log('📨 Отримано:', message.destinationName, '→', message.payloadString);
          const msg = message.payloadString;
          
          if (msg === 'opening') {
            setGateState('opening');
            setStatus('Ворота відчиняються...');
          } else if (msg === 'opened') {
            setGateState('open');
            setStatus('Ворота відчинені');
          } else if (msg === 'closing') {
            setGateState('closing');
            setStatus('Ворота зачиняються...');
          } else if (msg === 'closed') {
            setGateState('closed');
            setStatus('Ворота зачинені');
          } else if (msg === 'online') {
            console.log('✅ ESP32 в мережі');
            // Не змінюємо стан - ESP32 надішле поточний статус
          } else if (msg === 'state_open') {
            // Поточний стан від ESP32
            setGateState('open');
            setStatus('Ворота відчинені');
          } else if (msg === 'state_closed') {
            // Поточний стан від ESP32
            setGateState('closed');
            setStatus('Ворота зачинені');
          }
        };

        const connectOptions = {
          useSSL: true,
          timeout: 10,
          keepAliveInterval: 30,
          onSuccess: () => {
            setConnected(true);
            setStatus('Підключено до брокера');
            console.log('✅ Підключено до MQTT брокера (EMQX)');
            
            const statusTopic = `gate/${GATE_ID}/status`;
            const controlTopic = `gate/${GATE_ID}/control`;
            
            client.subscribe(statusTopic, {
              onSuccess: () => {
                console.log(`✅ Підписано на ${statusTopic}`);
                
                // Запитуємо поточний стан воріт
                const stateRequest = new window.Paho.MQTT.Message('get_state');
                stateRequest.destinationName = controlTopic;
                stateRequest.qos = 0;
                client.send(stateRequest);
                console.log('📤 Запит поточного стану воріт');
              },
              onFailure: (err) => console.error('❌ Помилка підписки:', err)
            });
          },
          onFailure: (error) => {
            setConnected(false);
            setStatus('Помилка підключення');
            console.error('❌ Помилка підключення:', error);
            setTimeout(connectMQTT, 5000);
          }
        };

        client.connect(connectOptions);
        clientRef.current = client;

      } catch (error) {
        console.error('❌ Помилка:', error);
        setStatus('Помилка ініціалізації');
      }
    };

    // Завантажуємо MQTT клієнт
    if (!window.Paho) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js';
      script.onload = () => {
        console.log('📚 Paho MQTT бібліотека завантажена');
        connectMQTT();
      };
      script.onerror = () => {
        console.error('❌ Помилка завантаження Paho MQTT');
        setStatus('Помилка завантаження MQTT');
      };
      document.head.appendChild(script);
    } else {
      connectMQTT();
    }

    return () => {
      if (clientRef.current && clientRef.current.isConnected()) {
        console.log('👋 Відключення MQTT');
        clientRef.current.disconnect();
      }
    };
  }, []);

  const handleGateControl = () => {
    if (!clientRef.current || !connected) {
      setStatus('Немає з\'єднання з брокером');
      console.error('❌ Немає підключення до MQTT');
      return;
    }

    if (!clientRef.current.isConnected()) {
      setStatus('Клієнт не підключений');
      console.error('❌ Клієнт не підключений');
      return;
    }

    setLoading(true);
    
    // Визначаємо команду залежно від стану воріт
    const command = (gateState === 'closed' || gateState === 'closing') ? 'open' : 'close';
    const message = new window.Paho.MQTT.Message(command);
    message.destinationName = `gate/${GATE_ID}/control`;
    message.qos = 0;
    message.retained = false;
    
    try {
      clientRef.current.send(message);
      console.log(`📤 Відправлено команду "${command}" → gate/control`);
      
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('❌ Помилка відправки:', error);
      setStatus('Помилка відправки команди');
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {!isUnlocked ? (
        /* PIN-код екран */
        <div className="pin-wrapper">
          <div className="pin-card">
            <div className="pin-header">
              <Lock size={48} strokeWidth={1.5} />
              <h1 className="pin-title">Введіть PIN-код</h1>
            </div>
            
            <form onSubmit={handlePinSubmit}>
              <div className={`pin-input-wrapper ${error ? 'shake' : ''}`} onClick={() => document.querySelector('.pin-input').focus()}>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => handlePinInput(e.target.value)}
                  className="pin-input"
                  placeholder="••••"
                  maxLength={4}
                  autoFocus
                  autoComplete="off"
                />
                <div className="pin-dots">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`pin-dot ${i < pin.length ? 'filled' : ''}`}
                    />
                  ))}
                </div>
              </div>
              
              {error && (
                <div className="pin-error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              
              <button
                type="submit"
                disabled={pin.length !== 4}
                className="pin-submit"
              >
                {pin.length === 4 ? 'Підтвердити' : `Введіть ${4 - pin.length} цифр${4 - pin.length === 1 ? 'у' : 'и'}`}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Головний екран */
        <div className="main-card-wrapper">
          <div className="main-card">
            <div className="pin-header" style={{ marginBottom: '1.5rem' }}>
              <h1 className="pin-title">Smart Gate</h1>
            </div>

            {/* Статус */}
            <div className="status-bar">
              <div className="status-indicator">
                <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
                <span className="status-label">{status}</span>
              </div>
            </div>

            {/* Головна кнопка */}
            <button
              onClick={handleGateControl}
              disabled={!connected || gateState === 'opening' || gateState === 'closing'}
              className={`gate-button ${gateState}`}
            >
              {/* Прогрес бар */}
              {(gateState === 'opening' || gateState === 'closing') && (
                <div className="progress-ring">
                  <svg className="progress-svg" viewBox="0 0 200 200">
                    <circle
                      className="progress-circle-bg"
                      cx="100"
                      cy="100"
                      r="90"
                    />
                    <circle
                      className="progress-circle"
                      cx="100"
                      cy="100"
                      r="90"
                    />
                  </svg>
                </div>
              )}

              <div className="gate-icon">
                {gateState === 'opening' || gateState === 'closing' ? (
                  <div className="spinner-ring" />
                ) : gateState === 'open' ? (
                  <Lock size={48} strokeWidth={1.5} />
                ) : (
                  <Unlock size={48} strokeWidth={1.5} />
                )}
              </div>
              <div className="gate-text">
                {gateState === 'opening' ? (
                  'Відчиняються...'
                ) : gateState === 'closing' ? (
                  'Зачиняються...'
                ) : gateState === 'open' ? (
                  'Зачинити'
                ) : (
                  'Відкрити'
                )}
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GateControl;
