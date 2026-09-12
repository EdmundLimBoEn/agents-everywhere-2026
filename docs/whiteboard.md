# Whiteboard

Web uses Excalidraw scene JSON. iOS uses PencilKit. Both map to one shared board model. Pixel-perfect parity is not required. Semantic compatibility is.

## Who can change the board

The student and the agent can draw, write, erase, move, highlight, annotate, label, point, and complete diagrams.

The agent usually emits high-level actions. Machine 1 executes them. Machine 2 does not render.

```json
{
  "action": "drawArrow",
  "from": "battery",
  "to": "resistor",
  "label": "conventional current"
}
```

Raw scene edits exist for complex operations.

## Pedagogy

Typical tasks: complete this circuit, label the organ, draw the force direction, move this ion, finish the graph, circle the mistake.

Old boards persist. The agent can reopen them. The learner model may extract misconceptions from them. Offline, a student can still open, create, and edit boards. Those sync later. Tutoring itself needs the network.

## Persistence

Store board, scene, lessonId, courseId, itemId, studentId, and timestamps. Snapshots may go to object storage. The same Classroom assignment reopens the same board.
