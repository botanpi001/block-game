export type BlockType = "circle" | "square" | "triangle" | "star";

export interface Block {
  id: number;
  type: BlockType;
}
