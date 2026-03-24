import React, { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  Title,
  ChartOptions,
  ActiveElement,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { ITaskListItem, IGateListItem } from "../../../models";
import { GetBucketStatusFromTasks, StatusToColor } from "../utils/GetGateStatus";

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface DoughnutChartProps {
  gates: IGateListItem[];
  tasks: ITaskListItem[] | null;
  complete: number;
  showLegend?: boolean | true; 
  onSelectItem?: (item: string, group: string) => void;
}

const DoughnutChart: React.FC<DoughnutChartProps> = ({
  gates,
  tasks,
  complete,
  showLegend,
  onSelectItem,
}) => {
  const values = gates.length > 0 ? gates.map(() => 100 / gates.length) : [];

  const data = useMemo(
    () => ({
      labels: showLegend ? gates.map(g => g.Gate) : gates.map(g => g.Gate.substring(0, 1)),
      datasets: [
        {
          data: values,
          backgroundColor: gates.map(g => {
            const gateTasks = (tasks || []).filter(t => t.Gate === g.Gate);
            const status = GetBucketStatusFromTasks(gateTasks);
            return StatusToColor(status, true);
          }),
          hoverBackgroundColor: gates.map(g => {
            const gateTasks = (tasks || []).filter(t => t.Gate  === g.Gate);
            const status = GetBucketStatusFromTasks(gateTasks);
            return StatusToColor(status, false);
          }),
          borderColor: "#F5F5F5",
          borderWidth: 2,
        },
      ],
    }),
    [gates, tasks, values, showLegend]
  );

  const centerTextPlugin = {
    id: "centerText",
    beforeDraw: (chart: any) => {
      const { width, height, ctx } = chart;
      ctx.restore();
      const fontSize = (height / 80).toFixed(2);
      ctx.font = `${fontSize}em sans-serif`;
      ctx.textBaseline = "middle";
      const text = `${complete}%`;
      const textX = Math.round((width - ctx.measureText(text).width) / 2);
      const textY = height / 2;
      ctx.fillStyle = "#333";
      ctx.fillText(text, textX, textY);
      ctx.save();
    },
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {      
      legend: { 
        display: false,
        position: "right",
      },
      datalabels: {
        color: "darkblue",
        font: { weight: "bold", size: 14 },
        formatter: (_value, ctx) => {
          const index = ctx.dataIndex;
          return data.labels?.[index]?.[0] ?? "";  // ⭐ First Character
        },
        anchor: "center",
        align: "center",
      },
      tooltip: {
        enabled: true,
        titleAlign: "left",
        bodyAlign: "left",  
        padding: 5,
        caretPadding: 20,
        callbacks: {
          label: (context) => {
            const index = context.dataIndex;
            const gate = gates[index];           
            return [
                `${gate?.Complete?.toFixed(0)}%`
              ];
          },
        }
      },
    },
    hover: { mode: "nearest", intersect: true },
    
    // Section XOR Center
    onClick: (_event, elements: ActiveElement[]) => {
      //console.log("[DoughnutChart] Click detected, elements:", elements.length);
      
      // CASE 1: Click on a section
      if (elements && elements.length > 0) {
        const index = elements[0].index;
        const gate = gates[index];
        
        //console.log("[DoughnutChart] → Section:", gate.Gate);
        
        if (gate && onSelectItem) {
          onSelectItem(gate.Gate, "gate");  
        }
        return; 
      }
      
      // CASE 2: Click on center (empty area)
      //console.log("[DoughnutChart] → Center (Show all)");
      
      if (onSelectItem) {
        onSelectItem("all", "gate");  // Show all sections
      }
    },
  };


  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <div style={{ width: "150px", height: "120px" }}>
        <Doughnut data={data} options={options} plugins={[centerTextPlugin]} />
      </div>

      {/* Legend with scroll, rendered only when visible */}
      {showLegend && (
        <div
          style={{
            width: "300px",
            maxHeight: "700px",
            overflowY: "auto",
            overflowX: "hidden",            
            padding: "8px",
            fontSize: "12px",
          }}
        >
          {gates.map((gate, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "4px",
                padding: "4px",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  border: "2px solid #a09f9f",
                  borderRadius: "2px",
                  backgroundColor: data.datasets[0].backgroundColor?.[idx],
                }}
              />
              <span>{gate.Complete?.toFixed(0)}{"% | "}{gate.Gate}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

};

export default DoughnutChart;
