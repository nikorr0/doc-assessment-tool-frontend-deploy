import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="card">
      <h2>Страница не найдена</h2>
      <p>Похоже, такой страницы нет. Вернитесь к списку проектов.</p>
      <Link to="/projects">
        <button>К проектам</button>
      </Link>
    </div>
  );
}

