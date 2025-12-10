import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Upload, Edit2, Check, X, Trash2 } from 'lucide-react';

// Types
type ContactStatus = 'Pendente' | 'Mensagem enviada' | 'Aguardando resposta' | 'Respondido' | 'Outro';

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: ContactStatus;
  customMessage?: string;
  timerActive?: boolean;
}

interface AppState {
  contacts: Contact[];
  defaultMessage: string;
  timerSeconds: number;
}

// Utility functions
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
};

const replacePlaceholders = (template: string, contact: Contact) => {
  return template
    .replace(/{name}/g, contact.name)
    .replace(/{phone}/g, contact.phone);
};

function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [defaultMessage, setDefaultMessage] = useState('Olá {name}, tudo bem? Aqui é da empresa XYZ.');
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [jsonInput, setJsonInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const savedContacts = localStorage.getItem('contacts_v1');
      const savedMessage = localStorage.getItem('wa_message_default');
      const savedTimer = localStorage.getItem('wa_timer_seconds');

      if (savedContacts) setContacts(JSON.parse(savedContacts));
      if (savedMessage) setDefaultMessage(savedMessage);
      if (savedTimer) setTimerSeconds(parseInt(savedTimer));
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (contacts.length > 0 || hasChanges) {
      localStorage.setItem('contacts_v1', JSON.stringify(contacts));
      localStorage.setItem('wa_message_default', defaultMessage);
      localStorage.setItem('wa_timer_seconds', timerSeconds.toString());
    }
  }, [contacts, defaultMessage, timerSeconds, hasChanges]);

  // Prevent page refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (contacts.length > 0) {
        e.preventDefault();
        e.returnValue = 'Tem certeza que quer atualizar a tela? Alterações não salvas serão perdidas.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [contacts]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const validateAndParseJSON = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      
      if (!Array.isArray(parsed)) {
        throw new Error('JSON deve ser um array de contatos');
      }

      return parsed.map((item: any) => {
        if (!item.name || !item.phone) {
          throw new Error('Cada contato deve ter "name" e "phone"');
        }

        return {
          id: item.id || generateId(),
          name: item.name,
          phone: item.phone.replace(/\D/g, ''),
          status: 'Pendente' as ContactStatus,
          customMessage: item.customMessage
        };
      });
    } catch (err) {
      throw new Error(`JSON inválido: ${err instanceof Error ? err.message : 'formato desconhecido'}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        const newContacts = validateAndParseJSON(result);
        setContacts(newContacts);
        setHasChanges(true);
        showSuccess(`${newContacts.length} contatos importados com sucesso!`);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasteJSON = () => {
    try {
      const newContacts = validateAndParseJSON(jsonInput);
      setContacts(newContacts);
      setJsonInput('');
      setHasChanges(true);
      showSuccess(`${newContacts.length} contatos importados com sucesso!`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao processar JSON');
    }
  };

  const startTimer = (contactId: string) => {
    setTimeout(() => {
      setContacts(prev => prev.map(contact => {
        if (contact.id === contactId && contact.status === 'Mensagem enviada') {
          return { ...contact, status: 'Aguardando resposta', timerActive: false };
        }
        return contact;
      }));
    }, timerSeconds * 1000);
  };

  const handleWhatsAppClick = (contact: Contact) => {
    const message = replacePlaceholders(contact.customMessage || defaultMessage, contact);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${contact.phone}?text=${encodedMessage}`;
    
    window.open(url, '_blank');
    
    setContacts(prev => prev.map(c => {
      if (c.id === contact.id) {
        startTimer(contact.id);
        return { ...c, status: 'Mensagem enviada', timerActive: true };
      }
      return c;
    }));
    setHasChanges(true);
  };

  const updateStatus = (contactId: string, newStatus: ContactStatus) => {
    setContacts(prev => prev.map(c => 
      c.id === contactId ? { ...c, status: newStatus, timerActive: false } : c
    ));
    setHasChanges(true);
  };

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setEditName(contact.name);
  };

  const saveEdit = (contactId: string) => {
    setContacts(prev => prev.map(c => 
      c.id === contactId ? { ...c, name: editName } : c
    ));
    setEditingId(null);
    setHasChanges(true);
  };

  const deleteContact = (contactId: string) => {
    if (confirm('Tem certeza que deseja excluir este contato?')) {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setHasChanges(true);
    }
  };

  const getStatusColor = (status: ContactStatus) => {
    const colors = {
      'Pendente': 'bg-gray-100 text-gray-700 border-gray-300',
      'Mensagem enviada': 'bg-blue-100 text-blue-700 border-blue-300',
      'Aguardando resposta': 'bg-yellow-100 text-yellow-700 border-yellow-300',
      'Respondido': 'bg-green-100 text-green-700 border-green-300',
      'Outro': 'bg-purple-100 text-purple-700 border-purple-300'
    };
    return colors[status];
  };

  const clearAllData = () => {
    if (confirm('Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.')) {
      setContacts([]);
      setJsonInput('');
      setHasChanges(false);
      localStorage.removeItem('contacts_v1');
      showSuccess('Todos os dados foram limpos');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-3">
            <MessageCircle className="text-green-600" size={40} />
            Gerenciador de Contatos WhatsApp
          </h1>
          <p className="text-gray-600">Importe, gerencie e envie mensagens para seus contatos</p>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-sm animate-pulse">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg shadow-sm">
            {success}
          </div>
        )}

        {/* Import Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Importar Contatos</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* File Upload */}
            <div>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-green-300 rounded-lg cursor-pointer bg-green-50 hover:bg-green-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="text-green-600 mb-2" size={32} />
                  <p className="text-sm text-gray-600 font-medium">Clique para importar JSON</p>
                  <p className="text-xs text-gray-500">ou arraste o arquivo aqui</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".json"
                  onChange={handleFileUpload}
                  aria-label="Importar arquivo JSON"
                />
              </label>
            </div>

            {/* Paste JSON */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-2">Ou cole o JSON aqui:</label>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='[{"name": "João", "phone": "5511999999999"}]'
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none font-mono text-sm"
                aria-label="Campo para colar JSON"
              />
              <button
                onClick={handlePasteJSON}
                disabled={!jsonInput.trim()}
                className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                aria-label="Processar JSON colado"
              >
                Processar JSON
              </button>
            </div>
          </div>
        </div>

        {/* Message Configuration */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Configurações</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mensagem Padrão (use {'{name}'} e {'{phone}'})
              </label>
              <textarea
                value={defaultMessage}
                onChange={(e) => {
                  setDefaultMessage(e.target.value);
                  setHasChanges(true);
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                rows={3}
                aria-label="Mensagem padrão para contatos"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timer para "Aguardando resposta" (segundos)
              </label>
              <input
                type="number"
                value={timerSeconds}
                onChange={(e) => {
                  setTimerSeconds(Math.max(1, parseInt(e.target.value) || 30));
                  setHasChanges(true);
                }}
                min="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                aria-label="Tempo do timer em segundos"
              />
              <button
                onClick={clearAllData}
                className="mt-4 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
                aria-label="Limpar todos os dados"
              >
                <Trash2 size={18} />
                Limpar Todos os Dados
              </button>
            </div>
          </div>
        </div>

        {/* Contacts List */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Contatos ({contacts.length})
          </h2>

          {contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MessageCircle size={64} className="mx-auto mb-4 opacity-20" />
              <p>Nenhum contato importado ainda</p>
              <p className="text-sm">Importe um arquivo JSON ou cole os dados acima</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow bg-gray-50"
                >
                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {editingId === contact.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                          autoFocus
                          aria-label="Editar nome do contato"
                        />
                        <button
                          onClick={() => saveEdit(contact.id)}
                          className="p-1 text-green-600 hover:bg-green-100 rounded"
                          aria-label="Salvar edição"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                          aria-label="Cancelar edição"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{contact.name}</span>
                        <button
                          onClick={() => startEdit(contact)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                          aria-label="Editar nome"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    )}
                    <span className="text-sm text-gray-600">{formatPhone(contact.phone)}</span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <select
                      value={contact.status}
                      onChange={(e) => updateStatus(contact.id, e.target.value as ContactStatus)}
                      className={`px-3 py-1 text-xs font-medium border rounded-full ${getStatusColor(contact.status)} focus:outline-none focus:ring-2 focus:ring-green-500`}
                      aria-label="Status do contato"
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Mensagem enviada">Mensagem enviada</option>
                      <option value="Aguardando resposta">Aguardando resposta</option>
                      <option value="Respondido">Respondido</option>
                      <option value="Outro">Outro</option>
                    </select>

                    {/* WhatsApp Button */}
                    <button
                      onClick={() => handleWhatsAppClick(contact)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
                      aria-label={`Enviar mensagem para ${contact.name}`}
                    >
                      <MessageCircle size={18} />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => deleteContact(contact.id)}
                      className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                      aria-label="Excluir contato"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Todos os dados são salvos localmente no seu navegador</p>
        </div>
      </div>
    </div>
  );
}

export default App;