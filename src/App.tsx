import React, { useState } from "react";
import "./styles.css";
import { Block, BlockType } from "./types";

const blockIcons: Record<BlockType, string> = {
  circle: "⚪",
  square: "⬜",
  triangle: "🔺",
  star: "⭐"
};

export default function App() {
  const [placedBlocks, setPlacedBlocks] = useState<
    { x: number; y: number; type: BlockType }[]
  >([]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("block-type") as BlockType;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 30;
    const y = e.clientY - rect.top - 30;
    setPlacedBlocks((prev) => [...prev, { x, y, type }]);
  };

  const handleTouchDrop = (type: BlockType, e: React.TouchEvent) => {
    const dropZone = document.getElementById("drop-zone");
    if (!dropZone) return;

    const rect = dropZone.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const x = touch.clientX - rect.left - 30;
    const y = touch.clientY - rect.top - 30;

    if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
      setPlacedBlocks((prev) => [...prev, { x, y, type }]);
    }
  };

  return (
    <div className="game-container">
      <h1>ブロックゲーム</h1>
      <div className="block-palette">
        {(["circle", "square", "triangle", "star"] as BlockType[]).map(
          (type) => (
            <div
              key={type}
              className="block"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData("block-type", type)
              }
              onTouchEnd={(e) => handleTouchDrop(type, e)}
            >
              {blockIcons[type]}
            </div>
          )
        )}
      </div>
      <div
        id="drop-zone"
        className="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {placedBlocks.map((block, index) => (
          <div
            key={index}
            className="placed-block"
            style={{ left: block.x, top: block.y }}
          >
            {blockIcons[block.type]}
          </div>
        ))}
      </div>
    </div>
  );
}
