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
  // Chart data
  // const getDelay = (delay: number, complete: number) => {
  //   //console.log("Styles:" + delay + "-" + complete);
  //   if (complete === 1) return "";
  //   if (delay > 0) return delay.toString;
  //   return ""; // Default Class
  // };
  const getCardColor = (delay: number, complete: number): string => {
    if (complete === 1) return "#4CAF50";
    if (delay > 0 && delay <= 7) return "#FFCE56";
    if (delay > 7) return "#FF3B4E";
    return "#FFFFFF "; // Default Class
  };
  const getCardBackground = (delay: number, complete: number): string => {
    if (complete === 1) return "#4CAF50CC"; //green
    if (delay > 0 && delay <= 7) return "#FFCE56CC"; //yellow
    if (delay > 7) return "#FF6384CC"; //red
    return "#CCCCFF80"; // Default Class
  };
  const data = {
    //labels: ["Red", "Blue", "Yellow", "Green", "Purple"],
    labels: gates.map((gate) => (gate.Title ?? gate.Gate).substring(0, 1)),
    datasets: [
      {
        data: [20, 20, 20, 20, 20], // Equal-weight slices
        backgroundColor: gates.map((gate, index) =>
          getCardColor(gate.Delay, gate.Complete)
        ), // Fill color per segment
        hoverBackgroundColor: gates.map((gate, index) =>
          getCardBackground(gate.Delay, gate.Complete)
        ), // Hover color per segment
        borderColor: "#F5F5F5", // Border color (Whitesmoke)
        borderWidth: 2, // Border width
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

  // Chart options (currently unused — options passed inline below)
  // const options = {
  //   responsive: true,
  //   plugins: {
  //     legend: {
  //       position: "right" as const, // Legend position
  //     },
  //     title: {
  //       display: true,
  //       text: "RF Cascade", // Chart title
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
              display: false, // Hide external legend
            },

            datalabels: {
              color: "darkblue", // Label text color
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
                  const value = Math.floor(gates[index].Complete * 100);

                  // Customize tooltip message
                  return `${value}% | Delay: ${Math.floor(gates[index].Delay)}`;
                },
                title: function () {
                  return "📌 Status:";
                },
              },
            },
          },
        }}
      />
    </div>

  );
};

export default PieChart;
