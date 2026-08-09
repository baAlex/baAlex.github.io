---
layout: post
title: "Polytopes, or: How convert a convex shape/body defined by planes into vertices without dying in the process"
short-title: Polytopes
permalink: "/polytopes"
tags: [Algorithm, Geometry, Game development, Quake-adjacent]
date: 2025-12-28
---

Surprisingly isn't that hard... as long you're not concerned about performance or doing it in real time. In my first, and suddenly final, attempt at doing it I was able to process a quite large map in around 2 ms (in a single thread on an Intel N95). I truly was expecting something horrible measured in seconds, but no, it was just the academic papers that scared me. Though, in their defence they were concerned about million of planes from weird malformed data. In my case I'm just parsing a MAP file made by a human being in a map editor (MAP file a la Quake 1, 2, 3, Half-Life, Doom 3, Half-Life 2, that kind).

Taking a face-centric approach, the problem to solve revolves around finding the vertices that form a particular face, done that, what remains is to repeat the algorithm through every face of the shape. It looks like this:

``` c++
struct Face
{
   Plane plane; // Where this face lies
   bool visible;
   List<Vector3> vertices; // What we want to calculate
};

void CalculateVertices(List<Face>* faces)
{
   for (Face* f = faces->Data(); f < faces->End(); f += 1)
   {
      if (f->visible == false)
         continue;

      // Intersect plane where face lies against other planes
      for (const Face* f2 = faces->Data(); f2 < faces->End(); f2 += 1)
      {
         if (f == f2) // Not against ourselves
            continue;

         Line line;
         if (PlanePlaneIntersection(f->plane, f2->plane, &line) == false)
            continue;

         // Clip intersection line into a segment
         // (by intersecting against other planes, oh no)
         Segment segment;
         for (const Face* f3 = faces->Data(); f3 < faces->End(); f3 += 1)
         {
            if (f3 == f2 || f3 == f)
               continue;

            // Cyrus-Beck algorithm
         }

         // Extract vertices from intersection segment,
         // store them in 'f->vertices', also validate them, reorder, you name it
      }
   }
}
```

`PlanePlaneIntersection` is the typical algorithm borrowed from elsewhere that returns a line from the intersection of two planes. That done, we don't want a line but a segment, so we clip it using Cyrus-Beck, which in my poor geometry understanding is a clever take on a line-plane intersection algorithm.

And you can stop reading here, I just wanted to point how the operation:

1. Grab one face
2. Intersect its plane against the plane of another face
3. Clip resulting line by (basically) intersecting it against all other planes
4. Repeat, go to 2 iterating all faces, then to 1 iterating all faces

Is absurdly fast.

For completeness here's how Cyrus-Beck looks in place:

``` c++
// Intersect plane where face lies against other planes
for (const Face* f2 = faces->Data(); f2 < faces->End(); f2 += 1)
{
   if (f == f2) // Not against ourselves
      continue;

   Line line;
   if (PlanePlaneIntersection(f->plane, f2->plane, &line) == false)
      continue;

   // Clip intersection line into a segment
   // (by intersecting against other planes, oh no)
   float t_min = -FLT_MAX;
   float t_max = FLT_MAX;

   for (const Face* f3 = faces->Data(); f3 < faces->End(); f3 += 1)
   {
      if (f3 == f2 || f3 == f)
         continue;

      // Cyrus-Beck algorithm
      const float denom = Dot(f3->plane.normal, line.normal);

      if (Equal(denom, 0.0f) == true) // Parallel
      {
         if (Dot(f3->plane.normal, line.origin) > f3->plane.distance)
         {
            // No only line is parallel, but is also outside this plane normal,
            // which means that in a convex body this line doesn't contribute to
            // overall shape
            goto outside_continue;
         }

         continue;
      }

      const float t = (f3->plane.distance - Dot(f3->plane.normal, line.origin)) / denom;

      if (denom < 0.0f)
         t_min = Max(t_min, t);
      else
         t_max = Min(t_max, t);

      if (t_max < t_min) // Line got trimmed out of existence
         goto outside_continue;
   }

   Segment segment;
   segment.a = line.origin + Scale(line.normal, t_min);
   segment.b = line.origin + Scale(line.normal, t_max);

   if (Length(segment.a - segment.b) < BIG_EPSILON)
   {
      // Intersection segment has basically zero length
      continue;
   }

   // Extract vertices from intersection segment,
   // store them in 'f->vertices', also validate them, reorder, you name it
   {
   }

outside_continue:
   continue;
}
```

Bit ugly unrolled like that, innit?, it can be abstracted. Anyway, `Equal` is basically `fabs(x) < EPSILON`, same intent with `BIG_EPSILON`, a small number appropriate for map editors (I'm using 0.5 since the minimum grid snap is 1 unit out there). Also, it shines the fact that we are dealing with convex shapes, as is extremely easy to remove intersections that don't contribute to overall shape. And finally a warning, all our faces here point outside, Cyrus-Beck will kick your dog or something if that isn't the case (although a single condition should be needed to deal with it, may be the case that our planes come from a bad BSP splitting stage).

And since you are still here, there's a little optimisation that can be done if you only need all vertices of the brush and no more than that. It exploits the fact that most of them are shared, so it only iterates over distinct pairs of faces:

``` c++
// Make a bbox
for (const Face* f1 = faces->Data(); f1 < faces->End(); f1 += 1)
{
   for (const Face* f2 = f1 + 1; f2 < faces->End(); f2 += 1) // Important part
   {
      if (cyrus_beck.Initialise(*f1, *f2) != 0)
         continue;

      for (const Face* f3 = faces->Data(); f3 < faces->End(); f3 += 1)
      {
         if (f3 == f2 || f3 == f1)
            continue;

         if (cyrus_beck.Step(f3) != 0)
            goto outside_continue;
      }

      Segment segment = cyrus_beck.End();

      bbox.max = Max(bbox.max, Max(segment.a, segment.b));
      bbox.min = Min(bbox.min, Min(segment.a, segment.b));

   outside_continue:
      continue;
   }
}
```

## Other approaches

This algorithm here is basically me trying to avoid the one proposed by Stefan Hajnoczi in [.MAP files file format description, algorithms, and code](https://github.com/stefanha/map-files/blob/master/MAPFiles.pdf) (2001). It looks like this:

```
For i = 0 to NumberOfFaces - 3
{
   For j = i to NumberOfFaces - 2
   {
      For k = j to NumberOfFaces - 1
      {
         if ( i != j != k )
         {
            legal = true;
            newVertex = GetIntersection ( i, j , k );

            for m = 0 to NumberOfFaces - 1
            {
               // Test if the point is outside the brush
               if ( DotProduct ( Faces[ m ].normal, newVertex ) + Faces[ m ].d > 0 )
               {
                  legal = false;
               }
            }

            if ( legal )
            {
               Polys[ i ].AddVertex ( newVertex );
               Polys[ j ].AddVertex ( newVertex );
               Polys[ k ].AddVertex ( newVertex );
            }
         }
      }
   }
}
```

Quite similar. For most purposes it's only one `for` more, and since brushes rarely have more than 6 faces I can imagine no performance impact at all.

Then there's the algorithm written by God himself, John Carmack. Which sadly, I couldn't understand except that he's really careful on preserving "windings" (segments in a face?) through the entire map compilation (why not make it at a final stage?). Someone summarised it on [quakewiki.org](https://quakewiki.org/wiki/Quake_Map_Format):

> Starting with the edges and vertices of a huge cube (usually ranging from -4096 to 4096 in each dimension), the edges of the cube are intersected with the planes of the faces. Upon each intersection, new edges and vertices are generated that replace some of the old ones until all planes have been used.

So it seems that Carmack is treating brushes like marble/wood carving. That's really calling for floating errors as it's an iterative approach, something that Hajnoczi and I are avoiding quite elegantly.

## ***

And that's all!, thanks for reading, see you later when I manage to write a BSP algorithm (maybe I will discover that I've been doing all this wrong).
