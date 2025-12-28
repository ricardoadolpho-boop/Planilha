
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, disableNetwork, enableNetwork } from "firebase/firestore";

// Configuração oficial do projeto planilhafinanceira01
const firebaseConfig = {
  apiKey: "AIzaSyAUyT-YQCSLSbhVUcZ7aBaDGihQqIPTH1c",
  authDomain: "planilhafinanceira01.firebaseapp.com",
  projectId: "planilhafinanceira01",
  storageBucket: "planilhafinanceira01.firebasestorage.app",
  messagingSenderId: "559993256892",
  appId: "1:559993256892:web:46337049cc7f9a30cb89b9"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Habilitar persistência offline (Engenharia de Resiliência)
// Isso permite que o app funcione sem internet e sincronize quando voltar
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('Persistência falhou: Múltiplas abas abertas.');
  } else if (err.code == 'unimplemented') {
    console.warn('Persistência não suportada neste navegador.');
  }
});

export const toggleNetwork = async (online: boolean) => {
  if (online) {
    await enableNetwork(db);
  } else {
    await disableNetwork(db);
  }
};
