import React, { useState } from "react";
import api from "../services/api";

interface LoginModalProps {
  onLoginSuccess: (data: any) => void;
  onLoginError: (message: string) => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onLoginError }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!username || !password) {
      onLoginError("Por favor ingrese un nombre de usuario y una contraseña.");
      return;
    }

    try {
      const response = await api.login({ username, password });
      console.log("Inicio de sesión exitoso:", response);
      onLoginSuccess(response);
    } catch (error: any) {
      console.error("Error al iniciar sesión:", error.message);
      onLoginError(error.message);
    }
  };

  return (
    <div>
      <h2>Iniciar Sesión</h2>
      <input
        type="text"
        placeholder="Correo electrónico"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleLogin}>Iniciar Sesión</button>
    </div>
  );
};

export default LoginModal;

