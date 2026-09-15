import React from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from "chart.js";
// Register required ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend, Title);

const ProjectTempPie: React.FC = () => {
  // Chart data
  const data = {
    labels: [
      "1.Kick Off",
      "2.Requirements",
      "3.Proof of Concept",
      "4.MVP Implementation",
      "5.Production",
    ],
    datasets: [
      {
        data: [20, 20, 20, 20, 20], // Equal-weight slices
        backgroundColor: [
          "#4CAF50", // Completed
          "#4CAF50", // Completed
          "#4CAF50", // Completed
          "#ffffff", // Pending
          "#ffffff", // Pending
        ], // Fill colors per segment
        hoverBackgroundColor: [
          "#4CAF50CC",
          "#4CAF50CC",
          "#4CAF50CC",
          "#4CAF50CC",
          "#4CAF50CC",
        ], // Hover colors per segment
      },
    ],
  };

  // Chart options
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "right" as const, // Legend position
      },
      title: {
        display: true,
        text: "% Complete", // Chart title
      },
    },
  };

  return (
    <div style={{ width: "400px", margin: "0 auto" }}>
      <Pie data={data} options={options} />
    </div>
  );
};

export default ProjectTempPie;
