import React from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from "chart.js";
import { ITaskListItem } from "../../../models";
import { IGateListItem } from "../../../models";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { GetBucketStatusFromTasks, StatusToColor } from "./GetGateStatus";
//import { GroupByProject } from "./GroupByProject";

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface ChartProps {
  gates: IGateListItem[];
  tasks: ITaskListItem[] | null;
  complete: number;
}

const DoughnutChart: React.FC<ChartProps> = ({ gates, tasks, complete }) => {

  const values = gates.length > 0
  ? gates.map(() => 100 / gates.length)
  : [];

  const data = {
    labels: gates.map(g => g.Title.substring(0, 1)),
    datasets: [
      {
        data: values,
        backgroundColor: gates.map(g => {
          const gateTasks = (tasks || []).filter(
            t => t.Title === g.Title   // o t.GateId === g.Id
          );
          const status = GetBucketStatusFromTasks(gateTasks);
          return StatusToColor(status, true);
        }),
        hoverBackgroundColor: gates.map(g => {
          const gateTasks = (tasks || []).filter(
            t => t.Title === g.Title   // mismo criterio
          );
          const status = GetBucketStatusFromTasks(gateTasks);
          return StatusToColor(status, false);
        }),
        borderColor: "#F5F5F5",
        borderWidth: 2,
      },
    ],

  };

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
