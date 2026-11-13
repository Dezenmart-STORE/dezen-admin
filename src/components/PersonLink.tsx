import { Link } from 'react-router-dom';
import { useCan } from '../store';

/** A person's name, linked to their page only when the viewer's access covers People. */
export function PersonLink({ id, name }: { id: string; name: string }) {
  const can = useCan();
  return can('support', 'platform') ? (
    <Link to={`/people/${id}`} className="text-info hover:underline">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}
