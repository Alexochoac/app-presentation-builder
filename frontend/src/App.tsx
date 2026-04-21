import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Trash2, ChevronUp, ChevronDown } from "lucide-react"

interface Slide {
  id: number
  title: string
}

export default function App() {
  const [slides, setSlides] = useState<Slide[]>([{ id: 1, title: "My First Slide" }])
  const [activeSlideId, setActiveSlideId] = useState(1)

  const activeSlide = slides.find(s => s.id === activeSlideId)!

  const addSlide = () => {
    const newId = Date.now()
    setSlides([...slides, { id: newId, title: "New Slide" }])
    setActiveSlideId(newId)
  }

  const updateTitle = (value: string) => {
    setSlides(slides.map(s => s.id === activeSlideId ? { ...s, title: value } : s))
  }

  const deleteSlide = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (slides.length === 1) return
    const newSlides = slides.filter(s => s.id !== id)
    setSlides(newSlides)
    if (activeSlideId === id) setActiveSlideId(newSlides[0].id)
  }

  const moveSlide = (index: number, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation()
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= slides.length) return
    const newSlides = [...slides]
    ;[newSlides[index], newSlides[targetIndex]] = [newSlides[targetIndex], newSlides[index]]
    setSlides(newSlides)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* SIDEBAR */}
      <div className="w-64 bg-card border-r border-border p-4 flex flex-col gap-3">
        <h2 className="font-bold text-foreground">Slides</h2>
        <Button className="w-full" variant="outline" onClick={addSlide}>+ New Slide</Button>

        <div className="flex flex-col gap-2 mt-2">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              onClick={() => setActiveSlideId(slide.id)}
              className={`group p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                activeSlideId === slide.id
                  ? "border-primary bg-primary/10"
                  : "hover:bg-secondary border-transparent"
              }`}
            >
              <p className="text-sm font-medium text-foreground truncate">#{index + 1}: {slide.title}</p>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => moveSlide(index, "up", e)}>
                  <ChevronUp size={14} />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => moveSlide(index, "down", e)}>
                  <ChevronDown size={14} />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={(e) => deleteSlide(slide.id, e)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN EDITOR */}
      <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4">
        <Input
          value={activeSlide.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="max-w-md"
          placeholder="Type slide title..."
        />

        <Card className="w-full max-w-3xl aspect-video shadow-2xl flex items-center justify-center text-4xl font-bold text-foreground">
          {activeSlide.title}
        </Card>
      </div>
    </div>
  )
}
