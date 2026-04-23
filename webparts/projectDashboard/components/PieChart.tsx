import React from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from "chart.js";
import { IGateListItem } from "../../../models";
import ChartDataLabels from "chartjs-plugin-datalabels";

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface PieProps {
  gates: IGateListItem[];
}

const PieChart: React.FC<PieProps> = ({ gates }) => {
  // Datos para el gráfico
  // const getDelay = (delay: number, complete: number) => {
  //   //console.log("Styles:" + delay + "-" + complete);
  //   if (complete === 1) return "";
  //   if (delay > 0) return delay.toString;
  //   return ""; // Default Class
  // };
  const getCardColor = (delay: number, complete: number): string => {
    //console.log("Styles:" + delay + "-" + complete);
    if (complete === 1) return "#4CAF50";
    if (delay > 0 && delay <= 7) return "#FFCE56";
    if (delay > 7) return "#FF3B4E";
    return "#FFFFFF "; // Default Class
  };
  const getCardBackground = (delay: number, complete: number): string => {
    //console.log("BackStyles:" + delay + "-" + complete);
    if (complete === 1) return "#4CAF50CC"; //green
    if (delay > 0 && delay <= 7) return "#FFCE56CC"; //yellow
    if (delay > 7) return "#FF6384CC"; //red
    return "#CCCCFF80"; // Default Class
  };
  const data = {
    //labels: ["Rojo", "Azul", "Amarillo", "Verde", "Púrpura"],
    labels: gates.map((gate, index) => gate.Title.substring(0, 1)),
    datasets: [
      {
        data: [20, 20, 20, 20, 20], // Valores
        backgroundColor: gates.map((gate, index) =>
          getCardColor(gate.Delay, gate.Complete)
        ), // Colores para cada segmento
        hoverBackgroundColor: gates.map((gate, index) =>
          getCardBackground(gate.Delay, gate.Complete)
        ), // Colores al hacer hover
        borderColor: "#F5F5F5", // Color del borde (Whitesmoke)
        borderWidth: 2, // Grosor del borde
      },
    ],
  };

  // const links = [
  //   "https://ed2corp.sharepoint.com/:li:/s/ED2Team/E80yc1ycjJJOqZv99gCYfVMBMM0JE1Gvmfo7wwwnQH9xUA?e=gOV6BU",
  //   "https://ed2corp.sharepoint.com/:li:/s/ED2Team/EycoaOw1kBFOqR2HsQZi8-oBHraIJzqD1aw6Ajttl-DALQ?e=oL8qAA",
  //   "https://ed2corp.sharepoint.com/:li:/s/ED2Team/E0dNXCD_b8RDtVu-1iIccSUBg_NANTyWM1D67eX-Lx8Xfg?e=quHqt6",
  //   "https://ed2corp.sharepoint.com/:li:/s/ED2Team/E1g56bPuMfJEjPOOyncqj-QBaQUCT4Qy8pNfUc5ODbCQXg?e=TZekzB",
  //   "https://ed2corp.sharepoint.com/:li:/s/ED2Team/E4GkxjRpQGVCjEh05S4rS_kB5Y7iVAUiWr9VINpNSjJ1zw?e=FKXSai",
  // ];

  // const onClick = (event, elements) => {
  //   if (elements.length > 0) {
  //     const index = elements[0].index;
  //     window.open(links[index], "_blank");
  //   }
  // };

  // Opciones de configuración del gráfico
  // const options = {
  //   responsive: true,
  //   plugins: {
  //     legend: {
  //       position: "right" as const, // Coloca la leyenda en la parte superior
  //     },
  //     title: {
  //       display: true,
  //       text: "RF Cascade", // Título del gráfico
  //     },
  //   },
  // };

  return (
    <div style={{ width: "150px", margin: "0", alignContent: "start" }}>
      <Pie
        data={data}
        options={{
          responsive: true,
          plugins: {
            legend: {
              display: false, // Oculta la leyenda externa
            },

            datalabels: {
              color: "darkblue", // Color del texto dentro del pie
              font: {
                weight: "bold",
                size: 14,
              },
              formatter: (value, ctx) => {
                const index = ctx.dataIndex;
                return `${data.labels[index]}`; // Muestra nombre y porcentaje dentro de cada rebanada
                // return `${data.labels[index]}\n(${Math.floor(
                //   gates[index].Complete * 100
                // )}%)`; // Muestra nombre y porcentaje dentro de cada rebanada
              },
              anchor: "center",
              align: "center",
            },
            tooltip: {
              callbacks: {
                label: function (tooltipItem) {
                  const index = tooltipItem.dataIndex;
                  const value = Math.floor(gates[index].Complete * 100);

                  // Personaliza el mensaje del tooltip
                  return `${value}% | Delay: ${Math.floor(gates[index].Delay)}`;
                },
                title: function () {
                  return "📌 Status:";
                },
              },
            },
          },
          // onClick: onClick,
        }}
      />
    </div>

    // <div style={{ width: "300px", margin: "0 auto" }}>
    //   <Pie data={data} options={options} />
    // </div>
  );
};

export default PieChart;
