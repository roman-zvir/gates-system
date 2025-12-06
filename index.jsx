import React, { useState, useEffect, useRef } from 'react';
import { Wifi, Lock, Unlock, Power, AlertCircle } from 'lucide-react';

const GateControl = () => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Не підключено');
  const [loading, setLoading] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    // Підключення до MQTT через WebSocket
    const connectMQTT = () => {
      try {
        // Використовуємо публічний брокер EMQX з WebSocket
        const clientId = 'webClient_' + Math.random().toString(16).substr(2, 8);
        console.log('Creating MQTT client with ID:', clientId);
        
        const client = new window.Paho.MQTT.Client(
          'broker.emqx.io',
          8084,  // WSS port
          '/mqtt',
          clientId
        );

        client.onConnectionLost = (responseObject) => {
          if (responseObject.errorCode !== 0) {
            setConnected(false);
            setStatus('З\'єднання втрачено');
            console.log('Втрачено з\'єднання:', responseObject.errorMessage);
            // Спроба повторного підключення
            setTimeout(connectMQTT, 5000);
          }
        };

        client.onMessageArrived = (message) => {
          console.log('Отримано повідомлення:', message.destinationName, message.payloadString);
          if (message.payloadString === 'opened') {
            setStatus('Ворота відкриті!');
            setTimeout(() => setStatus('Підключено до брокера'), 2000);
          } else if (message.payloadString === 'online') {
            console.log('ESP32 online');
          }
        };

        const connectOptions = {
          useSSL: true,  // Використовуємо SSL для WSS
          timeout: 10,
          keepAliveInterval: 30,
          onSuccess: () => {
            setConnected(true);
            setStatus('Підключено до брокера');
            console.log('Підключено до MQTT брокера');
            
            // Підписуємось на топік статусу
            client.subscribe('gate/status', {
              onSuccess: () => console.log('Підписано на gate/status'),
              onFailure: (err) => console.error('Помилка підписки:', err)
            });
          },
          onFailure: (error) => {
            setConnected(false);
            setStatus('Помилка підключення');
            console.error('Помилка підключення:', error);
            console.error('Error code:', error.errorCode);
            console.error('Error message:', error.errorMessage);
            // Спроба повторного підключення
            setTimeout(connectMQTT, 5000);
          }
        };

        client.connect(connectOptions);
        clientRef.current = client;

      } catch (error) {
        console.error('Помилка:', error);
        setStatus('Помилка ініціалізації');
      }
    };

    // Завантажуємо MQTT клієнт
    if (!window.Paho) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js';
      script.onload = () => {
        console.log('Paho MQTT library loaded');
        connectMQTT();
      };
      script.onerror = () => {
        console.error('Failed to load Paho MQTT library');
        setStatus('Помилка завантаження MQTT');
      };
      document.head.appendChild(script);
    } else {
      connectMQTT();
    }

    return () => {
      if (clientRef.current && clientRef.current.isConnected()) {
        console.log('Disconnecting MQTT client');
        clientRef.current.disconnect();
      }
    };
  }, []);

  const handleOpenGate = () => {
    if (!clientRef.current || !connected) {
      setStatus('Немає з\'єднання з брокером');
      console.error('No MQTT connection');
      return;
    }

    if (!clientRef.current.isConnected()) {
      setStatus('Клієнт не підключений');
      console.error('Client not connected');
      return;
    }

    setLoading(true);
    const message = new window.Paho.MQTT.Message('open');
    message.destinationName = 'gate/control';
    message.qos = 0;  // QoS рівень 0
    message.retained = false;
    
    try {
      clientRef.current.send(message);
      setStatus('Команда відправлена...');
      console.log('✅ Відправлено команду "open" на топік gate/control');
      
      setTimeout(() => {
        setLoading(false);
        if (connected) {
          setStatus('Підключено до брокера');
        }
      }, 1000);
    } catch (error) {
      console.error('Помилка відправки:', error);
      setStatus('Помилка відправки команди');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Головна картка */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          {/* Заголовок */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
              <Lock className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Керування Воротами
            </h1>
            <p className="text-blue-200">ESP32 + MQTT Control</p>
          </div>

          {/* Статус підключення */}
          <div className={`flex items-center justify-center gap-2 p-4 rounded-lg mb-6 ${
            connected ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            <Wifi className={`w-5 h-5 ${connected ? 'text-green-400' : 'text-red-400'}`} />
            <span className={`font-medium ${connected ? 'text-green-200' : 'text-red-200'}`}>
              {status}
            </span>
          </div>

          {/* Кнопка відкриття */}
          <button
            onClick={handleOpenGate}
            disabled={!connected || loading}
            className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all transform ${
              connected && !loading
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-green-500/50 hover:scale-105 active:scale-95'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              {loading ? (
                <>
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Відкриваю...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-6 h-6" />
                  <span>ВІДКРИТИ ВОРОТА</span>
                </>
              )}
            </div>
          </button>

          {/* Інформація */}
          <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">Інформація:</p>
                <ul className="space-y-1 text-blue-300">
                  <li>• Брокер: broker.emqx.io:8084 (WSS)</li>
                  <li>• Топік: gate/control</li>
                  <li>• Команда: open</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Код для ESP32 */}
        <div className="mt-6 bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Power className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Код для Wokwi (ESP32)</h2>
          </div>
          <div className="text-sm text-slate-300 space-y-2">
            <p>1. Створіть новий проєкт ESP32 у Wokwi</p>
            <p>2. Скопіюйте код нижче у sketch.ino</p>
            <p>3. Додайте diagram.json для LED на пін 2</p>
            <p>4. Натисніть кнопку вище для тесту!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GateControl;