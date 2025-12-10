import React from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from "chart.js";
import { IGateListItem } from "../../../models";
import ChartDataLabels from "chartjs-plugin-datalabels";
//import { GroupByProject } from "./GroupByProject";

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface ChartProps {
  gates: IGateListItem[];
  complete: number;
}

const DoughnutChart: React.FC<ChartProps> = ({ gates, complete }) => {

  //const project: IGateListItem = GroupByProject(gates);
  //console.log("[DoughnutChart] gates: " + gates.length + "-" + project.Complete);

  const getCardColor = (delay: number, complete: number) => {
    //console.log("Styles:" + delay + "-" + complete);
    if (complete === 100) return "#4CAF50";
    if (delay > 0 && delay <= 7) return "#FFCE56";
    if (delay > 7) return "#FF3B4E";
    return "#FFFFFF "; // Default Class
  };
  const getCardBackground = (delay: number, complete: number) => {
    //console.log("BackStyles:" + delay + "-" + complete);
    if (complete === 100) return "#4CAF50CC"; //green
    if (delay > 0 && delay <= 7) return "#FFCE56CC"; //yellow
    if (delay > 7) return "#FF6384CC"; //red
    return "#CCCCFF80"; // Default Class
  };
  
  const values = gates.length > 0
  ? gates.map(() => 100 / gates.length)
  : [];

  const data = {
    labels: gates.map(g => g.Title.substring(0, 1)),
    datasets: [
      {
        data: values,
        backgroundColor: gates.map(g =>
          getCardColor(g.Delay, g.Complete)
        ),
        hoverBackgroundColor: gates.map(g =>
          getCardBackground(g.Delay, g.Complete)
        ),
        borderColor: "#F5F5F5",
        borderWidth: 2,
      },
    ],
  };

  // const data = {
  //   labels: gates.map((gate, index) => gate.Title.substring(0, 1)),
  //   datasets: [
  //     {
  //       data: [20, 20, 20, 20, 20], // Valores
  //       backgroundColor: gates.map((gate, index) =>
  //         getCardColor(gate.Delay, gate.Complete)
  //       ), // Colores para cada segmento
  //       hoverBackgroundColor: gates.map((gate, index) =>
  //         getCardBackground(gate.Delay, gate.Complete)
  //       ), // Colores al hacer hover
  //       borderColor: "#F5F5F5", // Color del borde (Whitesmoke)
  //       borderWidth: 2, // Grosor del borde
  //     },
  //   ],
  // };


  const centerTextPlugin = {
    id: "centerText",
    beforeDraw: (chart) => {
      const { width, height, ctx } = chart;
      ctx.restore();

      const fontSize = (height / 80).toFixed(2);
      ctx.font = `${fontSize}em sans-serif`;
      ctx.textBaseline = "middle";
      const text = complete + "%";
      //const text = GroupByProject(gates).Complete + "%";
      const textX = Math.round((width - ctx.measureText(text).width) / 2);
      const textY = height / 2;

      ctx.fillStyle = "#333"; // Color del texto
      ctx.fillText(text, textX, textY);
      ctx.save();
    },
  };

  return (
    <div style={{ width: "120px", margin: "0", alignContent: "start" }}>
      <Doughnut
        data={data}
        options={{
          cutout: "70%",
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
                return `${data.labels[index]}`;
              },
              anchor: "center",
              align: "center",
            },
            tooltip: {
              callbacks: {
                label: function (tooltipItem) {
                  const index = tooltipItem.dataIndex;
                  const value = Math.floor(gates[index].Complete);

                  // Personaliza el mensaje del tooltip
                  return `${value}%|Del: ${Math.floor(gates[index].Delay)}`;
                },
                title: function () {
                  return "📌 Status:";
                },
              },
            },
          },
        }}
        plugins={[centerTextPlugin]}
      />
    </div>
  );
};

export default DoughnutChart;
