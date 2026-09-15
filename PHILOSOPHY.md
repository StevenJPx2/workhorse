# Philosophy

## What code should be in the age of agents

Agents make it cheap to generate code.
Now, the quality of code is non-deterministic.

No matter what Boris Cherny says, coding is **not solved**.

So how do we leverage the power of agents without giving in to the issues?

## Design a framework

As a framework author myself, I noticed a couple things from both building and how users use a framework.

1. **Code separation**
   From building, I realised that how much ever you WANT to separate concerns, unless you fully know what you want to build and how to build it, your perfectly separated "sections" will have cross-contamination.
   So, does that mean to completely abandon the idea? HECK NO. In fact, make the boundaries harder and clearer. The best thing about LLMs is that they allow you to cut yourself quicker so you have more time to recover.

One thing that I realised with building frameworks is that proper code separation allows the code to be self-descriptive, cleaner, and lot less headache to deal with, if done the right way.

Go and Rust have it figured it out with the crate and module separation, but Typescript is a lot more confusing with their monorepo situation. Unless you make it a separate publishable package, it's really difficult to create a separate package / module for a certain purpose. But once you do it, you know exactly what that package is for and what should live there. Architecture becomes a lot cleaner, and you have happy days.

If you use an interpreted language, you might suffer from performance issues, and overall, a bundle increase.

2. **Make it diffcult to make the wrong decisions**
   When building out the framework, I noticed that if you give the developer too many options / too much freedom they often most likely make the worst decision possible. This is why Go / Rust became so popular. They made it really diffcult to make wrong decisions. You would have to think through your decision, and more often than not, you land in the right place.

Too much freedom is not good.

### How do agents fit in?

Agents are like humans, but much less perceptive. They miss the larger picture and they can often focus on the wrong details. We do it too, but we learn from our mistakes. Agents might get there in time, but not right now.

So what makes something easier for humans to implement, makes it REALLY easy for agents to implement.
What's easy for humans to mess up in, agents mess up even more.

Most coding philosophies and practices written over time like TigerStyle were written ensure that the human developer make as little mistakes as possible.

It seems like we're in an age of rediscovery of these practices. ASD-STE100, Clean Code; these have become so much more important now because of this.

But mine are these: componentize / modularize code, stricter API.

Also, this does not make agents do hidden work. Whatever an agent is doing should be viewable and tweakable by a human.
