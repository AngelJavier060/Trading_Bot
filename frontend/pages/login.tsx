import { useState } from "react";
import { useRouter } from "next/router";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    // Validación de credenciales ficticias
    if (username === "admin" && password === "1234") {
      router.push("/dashboard"); // Redirige al Dashboard
    } else {
      alert("Usuario o contraseña incorrectos");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-900 to-blue-700">
      <div className="bg-white p-8 rounded shadow-lg w-96 border border-yellow-500">
        <h2 className="text-2xl font-bold text-center text-blue-900 mb-4">
          Bienvenido a AI Trading
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Ingresa tus credenciales para comenzar
        </p>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-gray-700 font-medium">
              Usuario
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-gray-700 font-medium">
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1234"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-yellow-500 text-white py-2 rounded hover:bg-yellow-600 font-bold"
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

