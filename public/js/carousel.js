document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const items = Array.from(carousel.querySelectorAll(".carousel-item"));
    if (items.length < 2) return;

    let index = 0;
    items.forEach((item, i) => item.classList.toggle("is-active", i === 0));

    setInterval(() => {
      items[index].classList.remove("is-active");
      index = (index + 1) % items.length;
      items[index].classList.add("is-active");
    }, 2000);
  });
});
