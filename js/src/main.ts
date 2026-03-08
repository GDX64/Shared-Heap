import init from "../pkg/shared_heap";

init().then((mod) => {
  console.log("shared-heap initialized", mod);
});
