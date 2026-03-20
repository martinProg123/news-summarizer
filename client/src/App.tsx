import { Button } from "@/components/ui/button"
import {
  Card,
  // CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "./components/ui/input"
import { Label } from "@/components/ui/label"
// import {
//   Select,
//   SelectContent,
//   SelectGroup,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { Circle, House, CircleCheck } from "lucide-react"
import { toast } from "sonner"
import { topics } from "@shared/constant"
import { useState } from "react"
import { z } from 'zod';

export function App() {
  const [selectedTopic, setSelectedTopic] = useState<Set<string>>(new Set())
  const [userEmail, setUserEmail] = useState('')
  const [duration, setDuration] = useState('24h')
  const apiUrl = import.meta.env.VITE_API_URL;
  const emailSchema = z.email("Invalid email format");
  const subSchema = z.object({
    userEmail: emailSchema,
    topicArr: z.array(z.string()).min(1, { message: "At least 1 topic" }),
    duration: z.enum(["24h"])
  })

  const sub2Email = async () => {
    try {
      const reqData = {
        topicArr: [...selectedTopic],
        userEmail,
        duration: '24h',
      }
      console.log(reqData)
      const subCheck = subSchema.safeParse(reqData);
      if (!subCheck.success)
        throw new Error(subCheck.error.issues[0]?.message)
      // if (!userEmail || !duration || selectedTopic.size === 0)
      //   throw new Error('Please enter full detail!')

      console.log(reqData)
      const response = await fetch(apiUrl + '/subEmail', {
        method: 'POST', // Specify the method
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqData),
      });

      console.log(response)
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`)

      setSelectedTopic(new Set())
      setUserEmail('')
      toast.success("Thanks for subscribing!"
        , { position: "top-center" }
      )
    } catch (error) {
      console.error('Error:', error);
      toast.error(" " + error
        , { position: "top-center" }
      )
    }
  }

  const unsub = async () => {
    try {
      const emailCheck = emailSchema.safeParse(userEmail);
      if (!emailCheck.success)
        throw new Error(`Invalid Email`)

      const response = await fetch(apiUrl + '/unsub', {
        method: 'POST', // Specify the method
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userEmail }),
      });

      if (!response.ok)
        throw new Error(`Try again later! `)
      toast.success("You have been unsubscribed!"
        , { position: "top-center" }
      )
    } catch (error) {
      console.error('Error:', error);
      toast.error(" " + error
        , { position: "top-center" }
      )
    }
  }

  return (
    <div className="flex flex-col min-h-svh p-6 gap-6">
      <header>
        <nav className="flex gap-4 font-semibold">
          {/* <a href="#"><House /></a> */}
          {/* <a href="#">Modify</a> */}
        </nav>
      </header>
      <main>
        {/* hero */}
        <div className="flex flex-col  items-center font-mono text-center pt-16 pb-12">
          <h1 className="mx-[4rem] leading-tighter text-3xl font-semibold tracking-tight text-balance text-primary lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter max-w-4xl">
            Your Daily News,
          </h1>
          <h2 className="mt-2 translate-x-0 md:translate-x-56 text-xl">
            curated by
            <i className="ml-1">
              AI
            </i>
          </h2>
        </div>

        <div className="w-full lg:max-w-xl mx-auto ">
          <Card className="text-lg">
            <CardHeader>
              <CardTitle>Subscribe to AI curated news</CardTitle>
              <CardDescription>Get Email everyday on selected AI summary news</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-6 w-full  ">
                <div className="grid gap-4">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    onChange={(el) => setUserEmail(el.target.value)}
                    value={userEmail}
                  />
                </div>
                <div className="grid gap-4">
                  <Label>Topics</Label>
                  <div className="flex gap-4">
                    {
                      topics.map(t => {
                        return (
                          <Toggle variant="outline" aria-label="Toggle italic"
                            pressed={selectedTopic.has(t)}
                            onPressedChange={(pressed) => {
                              const newSet = new Set(selectedTopic)
                              if (pressed) newSet.add(t)
                              else newSet.delete(t)
                              setSelectedTopic(newSet)
                            }}
                          >
                            <Circle className="group-data-[state=on]/toggle:hidden block" />
                            <CircleCheck className="group-data-[state=on]/toggle:block hidden" />
                            {t}
                          </Toggle>
                        )
                      })
                    }

                  </div>
                </div>
                {/* <div className="grid gap-4">
                  <Label >How often do you want to receive email?</Label>
                  <Select
                    value={duration}
                    onValueChange={(val) =>
                      setDuration(val)
                    }>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="How Often?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="24h">Every Day</SelectItem>
                        <SelectItem value="48h">Every 2 Days</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div> */}

              </div>
            </CardContent>
            <CardFooter>
              <div className="flex gap-6">

                <Button variant="outline" onClick={unsub} >
                  Unsubscribe
                </Button>
                <Button variant="outline" onClick={sub2Email} >
                  Subscribe!
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </main>
      <footer>

      </footer>
    </div>
  )
}

export default App
