import React, { useState, useEffect } from "react";
import {
  MessageCircle,
  Upload,
  Edit2,
  Check,
  X,
  Trash2,
  Eye,
  Search,
  Plus,
} from "lucide-react";
import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";

// Types
type ContactStatus =
  | "Pendente"
  | "Mensagem enviada"
  | "Aguardando resposta"
  | "Respondido"
  | "Outro";

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: ContactStatus;
  customMessage?: string;
  timerActive?: boolean;
  extraInfo?: Record<string, any>;
}

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const cleanPhoneNumber = (phone: string): string => {
  let cleaned = String(phone).replace(/\D/g, "");

  cleaned = cleaned.replace(/^0+/, "");

  if (!cleaned.startsWith("55") && cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }

  if (cleaned.length < 12) {
    throw new Error(`Número de telefone inválido: ${phone}`);
  }

  return cleaned;
};

const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(
      4,
      9
    )}-${cleaned.slice(9)}`;
  }
  return phone;
};

const replacePlaceholders = (template: string, contact: Contact) => {
  return template
    .replace(/{name}/g, contact.name)
    .replace(/{phone}/g, contact.phone);
};

const formatExcelDate = (value: any): string => {
  if (
    typeof value === "string" &&
    (value.includes("/") || value.includes("-"))
  ) {
    return value;
  }

  if (typeof value === "number" && value > 1000) {
    const excelEpoch = new Date(1900, 0, 1);
    const daysOffset = value - 2;
    const date = new Date(
      excelEpoch.getTime() + daysOffset * 24 * 60 * 60 * 1000
    );

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return String(value);
};

const formatCurrency = (value: any): string => {
  const numValue =
    typeof value === "number"
      ? value
      : parseFloat(
          String(value)
            .replace(/[^\d,-]/g, "")
            .replace(",", ".")
        );

  if (isNaN(numValue)) {
    return String(value);
  }

  return numValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [defaultMessage, setDefaultMessage] = useState(
    "Olá {name}, tudo bem? Aqui é da empresa XYZ."
  );
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [jsonInput, setJsonInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingContactId, setViewingContactId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  // Load from localStorage
  useEffect(() => {
    try {
      const savedContacts = localStorage.getItem("contacts_v1");
      const savedMessage = localStorage.getItem("wa_message_default");
      const savedTimer = localStorage.getItem("wa_timer_seconds");

      if (savedContacts) setContacts(JSON.parse(savedContacts));
      if (savedMessage) setDefaultMessage(savedMessage);
      if (savedTimer) setTimerSeconds(parseInt(savedTimer));
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }, []);

  useEffect(() => {
    if (contacts.length > 0 || hasChanges) {
      localStorage.setItem("contacts_v1", JSON.stringify(contacts));
      localStorage.setItem("wa_message_default", defaultMessage);
      localStorage.setItem("wa_timer_seconds", timerSeconds.toString());
    }
  }, [contacts, defaultMessage, timerSeconds, hasChanges]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (contacts.length > 0) {
        e.preventDefault();
        e.returnValue =
          "Tem certeza que quer atualizar a tela? Alterações não salvas serão perdidas.";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [contacts]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const validateAndParseJSON = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);

      if (!Array.isArray(parsed)) {
        throw new Error("JSON deve ser um array de contatos");
      }

      return parsed.map((item: any) => {
        if (!item.name || !item.phone) {
          throw new Error('Cada contato deve ter "name" e "phone"');
        }

        return {
          id: item.id || generateId(),
          name: item.name,
          phone: cleanPhoneNumber(item.phone),
          status: "Pendente" as ContactStatus,
          customMessage: item.customMessage,
        };
      });
    } catch (err) {
      throw new Error(
        `JSON inválido: ${
          err instanceof Error ? err.message : "formato desconhecido"
        }`
      );
    }
  };

  const parseExcelFile = (file: File): Promise<Contact[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
          }) as any[][];

          if (jsonData.length < 2) {
            throw new Error("Planilha vazia ou sem dados");
          }

          const headers = jsonData[0].map((h: any) =>
            String(h).toLowerCase().trim()
          );

          const nameIndex = headers.findIndex(
            (h: string) => h.includes("nome") || h === "name"
          );
          const phoneIndex = headers.findIndex(
            (h: string) =>
              h.includes("telefone") ||
              h.includes("phone") ||
              h.includes("celular")
          );

          if (nameIndex === -1 || phoneIndex === -1) {
            throw new Error(
              'Planilha deve conter colunas "Nome" e "Telefone" (ou variações)'
            );
          }

          const contacts: Contact[] = [];
          const errors: string[] = [];

          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const name = row[nameIndex];
            const phone = row[phoneIndex];

            if (!name || !phone) continue;

            try {
              const extraInfo: Record<string, any> = {};
              // Usar headers ORIGINAIS (não lowercase) para preservar case
              const originalHeaders = jsonData[0].map((h: any) =>
                String(h).trim()
              );

              originalHeaders.forEach((header: string, index: number) => {
                if (
                  index !== nameIndex &&
                  index !== phoneIndex &&
                  row[index] !== undefined &&
                  row[index] !== null &&
                  row[index] !== ""
                ) {
                  extraInfo[header] = row[index];
                }
              });

              contacts.push({
                id: generateId(),
                name: String(name).trim(),
                phone: cleanPhoneNumber(phone),
                status: "Pendente" as ContactStatus,
                extraInfo:
                  Object.keys(extraInfo).length > 0 ? extraInfo : undefined,
              });
            } catch (err) {
              errors.push(
                `Linha ${i + 1}: ${
                  err instanceof Error ? err.message : "erro desconhecido"
                }`
              );
            }
          }

          if (contacts.length === 0) {
            throw new Error(
              errors.length > 0
                ? `Nenhum contato válido encontrado. Erros: ${errors.join(
                    ", "
                  )}`
                : "Nenhum contato encontrado na planilha"
            );
          }

          if (errors.length > 0) {
            console.warn("Alguns contatos não puderam ser importados:", errors);
          }

          resolve(contacts);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
      reader.readAsBinaryString(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const isJson = file.name.endsWith(".json");

    try {
      if (isExcel) {
        const newContacts = await parseExcelFile(file);
        setContacts(newContacts);
        setHasChanges(true);
        showSuccess(`${newContacts.length} contatos importados do Excel!`);
      } else if (isJson) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const result = event.target?.result as string;
            const newContacts = validateAndParseJSON(result);
            setContacts(newContacts);
            setHasChanges(true);
            showSuccess(`${newContacts.length} contatos importados do JSON!`);
          } catch (err) {
            showError(
              err instanceof Error ? err.message : "Erro ao processar JSON"
            );
          }
        };
        reader.readAsText(file);
      } else {
        showError("Formato não suportado. Use .xlsx, .xls ou .json");
      }
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Erro ao processar arquivo"
      );
    }

    e.target.value = "";
  };

  const handlePasteJSON = () => {
    try {
      const newContacts = validateAndParseJSON(jsonInput);
      setContacts(newContacts);
      setJsonInput("");
      setHasChanges(true);
      showSuccess(`${newContacts.length} contatos importados com sucesso!`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Erro ao processar JSON");
    }
  };

  const startTimer = (contactId: string) => {
    setTimeout(() => {
      setContacts((prev) =>
        prev.map((contact) => {
          if (
            contact.id === contactId &&
            contact.status === "Mensagem enviada"
          ) {
            return {
              ...contact,
              status: "Aguardando resposta",
              timerActive: false,
            };
          }
          return contact;
        })
      );
    }, timerSeconds * 1000);
  };

  const handleWhatsAppClick = (contact: Contact) => {
    const message = replacePlaceholders(
      contact.customMessage || defaultMessage,
      contact
    );
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${contact.phone}?text=${encodedMessage}`;

    window.open(url, "_blank");

    setContacts((prev) =>
      prev.map((c) => {
        if (c.id === contact.id) {
          startTimer(contact.id);
          return { ...c, status: "Mensagem enviada", timerActive: true };
        }
        return c;
      })
    );
    setHasChanges(true);
  };

  const updateStatus = (contactId: string, newStatus: ContactStatus) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, status: newStatus, timerActive: false } : c
      )
    );
    setHasChanges(true);
  };

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setEditName(contact.name);
  };

  const saveEdit = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, name: editName } : c))
    );
    setEditingId(null);
    setHasChanges(true);
  };

  const deleteContact = (contactId: string) => {
    if (confirm("Tem certeza que deseja excluir este contato?")) {
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setHasChanges(true);
    }
  };

  const getStatusColor = (status: ContactStatus) => {
    const colors = {
      Pendente: "bg-gray-100 text-gray-700 border-gray-300",
      "Mensagem enviada": "bg-blue-100 text-blue-700 border-blue-300",
      "Aguardando resposta": "bg-yellow-100 text-yellow-700 border-yellow-300",
      Respondido: "bg-green-100 text-green-700 border-green-300",
      Outro: "bg-purple-100 text-purple-700 border-purple-300",
    };
    return colors[status];
  };

  const clearAllData = () => {
    if (
      confirm(
        "Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita."
      )
    ) {
      setContacts([]);
      setJsonInput("");
      setHasChanges(false);
      localStorage.removeItem("contacts_v1");
      showSuccess("Todos os dados foram limpos");
    }
  };

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      showError("Nome e telefone são obrigatórios");
      return;
    }

    try {
      const extraInfo: Record<string, any> = {
        "data de envio": "",
        "Comercial Responsável": "",
        "E-mail": "",
        Nome: newContactName.trim(),
        Telefone: cleanPhoneNumber(newContactPhone),
        Empresa: "",
        "Qual seu CNPJ": "",
        "Qualificado para CLT (sim/não)": "",
        Volume: "",
        "Follow Up WhatsApp": "",
        "Autoriza conexão parceiros": "",
        "Opera com quem?": "",
        "Encaminhado para parceiro UY3": "",
        "Obs:": "",
      };

      const newContact: Contact = {
        id: generateId(),
        name: newContactName.trim(),
        phone: cleanPhoneNumber(newContactPhone),
        status: "Pendente",
        extraInfo,
      };

      setContacts((prev) => [newContact, ...prev]);
      setHasChanges(true);
      setShowAddModal(false);
      setNewContactName("");
      setNewContactPhone("");
      showSuccess("Contato adicionado com sucesso!");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Erro ao adicionar contato"
      );
    }
  };

  const exportToExcel = () => {
    if (contacts.length === 0) {
      showError("Não há contatos para exportar");
      return;
    }

    try {
      const convertExcelDate = (value: any): any => {
        if (typeof value === "number" && value > 1000 && value < 100000) {
          const excelEpoch = new Date(1900, 0, 1);
          const daysOffset = value - 2;
          const date = new Date(
            excelEpoch.getTime() + daysOffset * 24 * 60 * 60 * 1000
          );
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        }
        return value;
      };

      const exportData = contacts.map((contact) => {
        const rowData: Record<string, any> = {};
        let followUpAdded = false;

        if (contact.extraInfo) {
          Object.entries(contact.extraInfo).forEach(([key, value]) => {
            const lowerKey = key.toLowerCase();

            if (
              lowerKey.includes("follow up") ||
              lowerKey.includes("followup")
            ) {
              return;
            }

            const originalKey = key;

            let formattedValue = value;

            if (
              lowerKey.includes("data") ||
              lowerKey.includes("date") ||
              lowerKey.includes("envio")
            ) {
              formattedValue = convertExcelDate(value);
            } else if (lowerKey.includes("cnpj")) {
              formattedValue = String(value).replace(/\D/g, "");
            }

            rowData[originalKey] = formattedValue;

            if (lowerKey.includes("volume") && !followUpAdded) {
              rowData["Follow UP - 18-11-2025"] = contact.status;
              followUpAdded = true;
            }
          });
        }

        if (!followUpAdded) {
          rowData["Follow UP - 18-11-2025"] = contact.status;
        }

        return rowData;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);

      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

      const colWidths: { wch: number }[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        let maxWidth = 10;

        for (let row = range.s.r; row <= range.e.r; row++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];

          if (cell && cell.v) {
            const cellLength = String(cell.v).length;
            maxWidth = Math.max(maxWidth, cellLength);
          }
        }

        colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
      }

      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();

      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!worksheet[cellAddress]) continue;

        worksheet[cellAddress].s = {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: {
            patternType: "solid",
            fgColor: { rgb: "FF8C00" },
            bgColor: { rgb: "FF8C00" },
          },
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: false,
          },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");

      const now = new Date();
      const fileName = `contatos_${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(
        now.getHours()
      ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}.xlsx`;

      XLSXStyle.writeFile(workbook, fileName);
      showSuccess(`${contacts.length} contatos exportados com sucesso!`);
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Erro ao exportar contatos"
      );
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-green-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-3">
            <MessageCircle className="text-green-600" size={40} />
            Gerenciador de Contatos WhatsApp
          </h1>
          <p className="text-gray-600">
            Importe, gerencie e envie mensagens para seus contatos
          </p>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              Importar Contatos
            </h2>
            <button
              onClick={exportToExcel}
              disabled={contacts.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
              aria-label="Exportar contatos para Excel"
            >
              <Upload size={18} className="rotate-180" />
              Exportar Excel
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* File Upload */}
            <div>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-green-300 rounded-lg cursor-pointer bg-green-50 hover:bg-green-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="text-green-600 mb-2" size={32} />
                  <p className="text-sm text-gray-600 font-medium">
                    Clique para importar JSON ou Excel
                  </p>
                  <p className="text-xs text-gray-500">
                    Arraste .json, .xlsx ou .xls aqui
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".json,.xlsx,.xls"
                  onChange={handleFileUpload}
                  aria-label="Importar arquivo JSON ou Excel"
                />
              </label>
            </div>

            {/* Paste JSON */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-2">
                Ou cole o JSON aqui:
              </label>
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
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Configurações
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mensagem Padrão (use {"{name}"} e {"{phone}"})
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
                  setTimerSeconds(Math.max(1, parseInt(e.target.value) || 5));
                  setHasChanges(true);
                }}
                min="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                aria-label="Tempo do timer em segundos"
              />
              <button
                onClick={clearAllData}
                className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2 hover:cursor-pointer"
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
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-800">
                Contatos ({contacts.length})
              </h2>
              <button
                onClick={() => setShowAddModal(true)}
                className="p-1.5 hover:cursor-pointer bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm hover:shadow-md"
                aria-label="Adicionar contato manualmente"
                title="Adicionar contato"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="relative flex-1 max-w-md">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                aria-label="Buscar contatos"
              />
            </div>
          </div>

          {contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MessageCircle size={64} className="mx-auto mb-4 opacity-20" />
              <p>Nenhum contato importado ainda</p>
              <p className="text-sm">
                Importe um arquivo JSON ou cole os dados acima
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {contacts
                .filter((contact) => {
                  const search = searchTerm.toLowerCase();
                  return (
                    contact.name.toLowerCase().includes(search) ||
                    contact.phone.includes(search) ||
                    formatPhone(contact.phone).includes(search)
                  );
                })
                .map((contact) => (
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
                          <span className="font-semibold text-gray-800">
                            {contact.name}
                          </span>
                          {contact.extraInfo &&
                            Object.keys(contact.extraInfo).length > 0 && (
                              <button
                                onClick={() => setViewingContactId(contact.id)}
                                className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded"
                                aria-label="Ver informações"
                                title="Ver mais informações"
                              >
                                <Eye size={14} />
                              </button>
                            )}
                          <button
                            onClick={() => startEdit(contact)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                            aria-label="Editar nome"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      )}
                      <span className="text-sm text-gray-600">
                        {formatPhone(contact.phone)}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-3">
                      <select
                        value={contact.status}
                        onChange={(e) =>
                          updateStatus(
                            contact.id,
                            e.target.value as ContactStatus
                          )
                        }
                        className={`px-3 py-1 text-xs font-medium border rounded-full ${getStatusColor(
                          contact.status
                        )} focus:outline-none focus:ring-2 focus:ring-green-500`}
                        aria-label="Status do contato"
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Mensagem enviada">
                          Mensagem enviada
                        </option>
                        <option value="Aguardando resposta">
                          Aguardando resposta
                        </option>
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

      {/* Modal de Adicionar Contato */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="bg-green-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus size={24} />
                  <h3 className="text-2xl font-bold">Adicionar Contato</h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Fechar"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Digite o nome do contato"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Telefone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Ex: 11999999999 ou +5511999999999"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Digite apenas números (DDD + número)
                  </p>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewContactName("");
                    setNewContactPhone("");
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddContact}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Plus size={18} />
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Informações Extras */}
      {viewingContactId &&
        (() => {
          const contact = contacts.find((c) => c.id === viewingContactId);
          if (!contact || !contact.extraInfo) return null;

          return (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setViewingContactId(null)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header do Modal */}
                <div className="sticky top-0 bg-linear-to-r from-green-600 to-blue-600 text-white p-6 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-bold">{contact.name}</h3>
                      <p className="text-green-100 text-sm mt-1">
                        {formatPhone(contact.phone)}
                      </p>
                    </div>
                    <button
                      onClick={() => setViewingContactId(null)}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors hover:cursor-pointer"
                      aria-label="Fechar"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>

                {/* Conteúdo do Modal */}
                <div className="p-6">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Eye size={20} className="text-blue-600" />
                    Informações Adicionais
                  </h4>

                  <div className="space-y-3">
                    {Object.entries(contact.extraInfo).map(([key, value]) => {
                      // Verifica se é um campo de data
                      const isDateField =
                        key.toLowerCase().includes("data") ||
                        key.toLowerCase().includes("date") ||
                        key.toLowerCase().includes("envio");

                      // Verifica se é um campo de valor/moeda
                      const isCurrencyField =
                        key.toLowerCase().includes("volume") ||
                        key.toLowerCase().includes("valor") ||
                        key.toLowerCase().includes("preco") ||
                        key.toLowerCase().includes("preço");

                      // Formata o valor conforme o tipo de campo
                      let displayValue = String(value);
                      if (isDateField) {
                        displayValue = formatExcelDate(value);
                      } else if (isCurrencyField) {
                        displayValue = formatCurrency(value);
                      }

                      return (
                        <div
                          key={key}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                        >
                          <span className="font-medium text-gray-700 capitalize min-w-[150px]">
                            {key.replace(/_/g, " ")}:
                          </span>
                          <span className="text-gray-900 wrap-break-word flex-1">
                            {displayValue}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botão de Fechar */}
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setViewingContactId(null)}
                      className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium hover:cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

export default App;
