import React, { useState } from "react";
import {
  CircularProgress,
  Alert,
  Button,
  Card,
  CardContent,
  Typography,
  Grid,
} from "@mui/material";
import { useRouter } from "next/router";
import ConfigurationForm from "@components/backtesting/ConfigurationForm";
import BacktestingControls from "@components/backtesting/BacktestingControls";
import BacktestingChart from "@components/backtesting/BacktestingChart";
import ReportTable from "@components/backtesting/ReportTable";

const Backtesting = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Datos ficticios para indicadores
  const summary = {
    totalTrades: 10,
    wins: 6,
    losses: 4,
    profit: 5.75,
    inProgress: 1,
  };

  const accountInfo = {
    account_type: "Demo",
    balance: 10000,
  };

  const handleStart = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setResults(summary);
    }, 2000);
  };

  const handlePause = () => setIsRunning(false);

  const handleStop = () => {
    setIsRunning(false);
    setResults(null);
  };

  const handleExit = () => {
    router.push("/dashboard");
  };

  return (
    <div className="container mx-auto py-8">
      {/* Encabezado */}
      <div className="flex justify-between items-center mb-8">
        <Typography variant="h4" component="h1" color="primary" className="font-bold">
          Backtesting
        </Typography>
        <Button variant="contained" color="secondary" onClick={handleExit}>
          Salir al Dashboard
        </Button>
      </div>

      {/* Información de la Cuenta */}
      <div className="mb-4">
        <Typography variant="subtitle1">
          Tipo de Cuenta: <strong>{accountInfo.account_type}</strong>
        </Typography>
        <Typography variant="subtitle1">
          Balance: <strong>${accountInfo.balance.toFixed(2)}</strong>
        </Typography>
      </div>

      {/* Indicadores */}
      <Grid container spacing={2} justifyContent="center" className="mb-6">
        <Grid item xs={12} md={3}>
          <Card
            className="text-center shadow-lg"
            style={{ border: "2px solid green", borderRadius: "10px" }}
          >
            <CardContent>
              <Typography variant="h6" color="primary">
                Ganadas
              </Typography>
              <Typography variant="h4" color="green">
                {summary.wins}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card
            className="text-center shadow-lg"
            style={{ border: "2px solid red", borderRadius: "10px" }}
          >
            <CardContent>
              <Typography variant="h6" color="primary">
                Perdidas
              </Typography>
              <Typography variant="h4" color="red">
                {summary.losses}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card
            className="text-center shadow-lg"
            style={{ border: "2px solid orange", borderRadius: "10px" }}
          >
            <CardContent>
              <Typography variant="h6" color="primary">
                En Curso
              </Typography>
              <Typography variant="h4" color="orange">
                {summary.inProgress}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card
            className="text-center shadow-lg"
            style={{ border: "2px solid blue", borderRadius: "10px" }}
          >
            <CardContent>
              <Typography variant="h6" color="primary">
                Ganancia Neta
              </Typography>
              <Typography variant="h4" color="blue">
                ${summary.profit.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Configuración y Controles */}
      <Grid container spacing={4}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" className="font-semibold mb-4">
                Configuración
              </Typography>
              <ConfigurationForm onSubmit={handleStart} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" className="font-semibold mb-4">
                Controles
              </Typography>
              <BacktestingControls
                onStart={handleStart}
                onPause={handlePause}
                onStop={handleStop}
                summary={results}
              />
              {isRunning && <CircularProgress className="mt-4" />}
              {error && (
                <Alert severity="error" className="mt-4">
                  {error}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Gráfica y Tabla */}
      {results && (
        <div className="mt-8">
          {/* Gráfica */}
          <Card className="mb-8">
            <CardContent>
              <Typography variant="h6" className="font-semibold mb-4">
                Gráfica de Balance
              </Typography>
              <BacktestingChart
                data={{
                  labels: ["Ene", "Feb", "Mar", "Abr", "May"],
                  datasets: [
                    {
                      label: "Balance ($)",
                      data: [1000, 1050, 1100, 950, 1200],
                      borderColor: "rgba(75, 192, 192, 1)",
                      backgroundColor: "rgba(75, 192, 192, 0.2)",
                    },
                  ],
                }}
              />
            </CardContent>
          </Card>

          {/* Tabla */}
          <Card>
            <CardContent>
              <Typography variant="h6" className="font-semibold mb-4">
                Detalles de Operaciones
              </Typography>
              <ReportTable
                trades={[
                  { id: 1, pair: "EUR/USD", type: "Compra", profit: 10 },
                  { id: 2, pair: "USD/JPY", type: "Venta", profit: -5 },
                  { id: 3, pair: "GBP/USD", type: "Compra", profit: 20 },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Backtesting;
