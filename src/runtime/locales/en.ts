import { ZcIssueCode, type ZcErrorMap } from '../error.ts';
import { assertNever, joinValues, stringify, ZcParsedType } from '../helpers.ts';

const errorMap: ZcErrorMap = (issue, _ctx) => {
	let message: string;
	switch (issue.code) {
		case ZcIssueCode.invalid_type:
			if (issue.received === ZcParsedType.undefined) {
				message = 'Required';
			} else {
				message = `Expected ${issue.expected}, received ${issue.received}`;
			}
			break;
		case ZcIssueCode.invalid_literal:
			message = `Invalid literal value, expected ${stringify(issue.expected)}`;
			break;
		case ZcIssueCode.unrecognized_keys:
			message = `Unrecognized key(s) in object: ${joinValues(issue.keys, ', ')}`;
			break;
		case ZcIssueCode.invalid_union:
			message = `Invalid input`;
			break;
		case ZcIssueCode.invalid_union_discriminator:
			message = `Invalid discriminator value. Expected ${joinValues(issue.options)}`;
			break;
		case ZcIssueCode.invalid_enum_value:
			message = `Invalid enum value. Expected ${joinValues(issue.options)}, received '${issue.received}'`;
			break;
		case ZcIssueCode.invalid_arguments:
			message = `Invalid function arguments`;
			break;
		case ZcIssueCode.invalid_return_type:
			message = `Invalid function return type`;
			break;
		case ZcIssueCode.invalid_date:
			message = `Invalid date`;
			break;
		case ZcIssueCode.invalid_string:
			if (typeof issue.validation === 'object') {
				if ('includes' in issue.validation) {
					message = `Invalid input: must include "${issue.validation.includes}"`;
					if (typeof issue.validation.position === 'number') {
						message += ` at one or more positions greater than or equal to ${issue.validation.position}`;
					}
				} else if ('startsWith' in issue.validation) {
					message = `Invalid input: must start with "${issue.validation.startsWith}"`;
				} else if ('endsWith' in issue.validation) {
					message = `Invalid input: must end with "${issue.validation.endsWith}"`;
				} else {
					assertNever(issue.validation);
				}
			} else if (issue.validation !== 'regex') {
				message = `Invalid ${issue.validation}`;
			} else {
				message = 'Invalid';
			}
			break;
		case ZcIssueCode.too_small:
			if (issue.type === 'array') {
				message = `Array must contain ${issue.exact ? 'exactly' : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
			} else if (issue.type === 'string') {
				message = `String must contain ${issue.exact ? 'exactly' : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
			} else if (issue.type === 'number') {
				message = `Number must be ${
					issue.exact
						? `exactly equal to`
						: issue.inclusive
							? `greater than or equal to`
							: `greater than`
				} ${issue.minimum}`;
			} else if (issue.type === 'date') {
				message = `Date must be ${
					issue.exact
						? `exactly equal to`
						: issue.inclusive
							? `greater than or equal to`
							: `greater than`
				} ${new Date(Number(issue.minimum))}`;
			} else {
				message = 'Invalid input';
			}
			break;
		case ZcIssueCode.too_big:
			if (issue.type === 'array') {
				message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
			} else if (issue.type === 'string') {
				message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
			} else if (issue.type === 'number') {
				message = `Number must be ${
					issue.exact
						? `exactly`
						: issue.inclusive
							? `less than or equal to`
							: `less than`
				} ${issue.maximum}`;
			} else if (issue.type === 'bigint') {
				message = `BigInt must be ${
					issue.exact
						? `exactly`
						: issue.inclusive
							? `less than or equal to`
							: `less than`
				} ${issue.maximum}`;
			} else if (issue.type === 'date') {
				message = `Date must be ${
					issue.exact
						? `exactly`
						: issue.inclusive
							? `smaller than or equal to`
							: `smaller than`
				} ${new Date(Number(issue.maximum))}`;
			} else {
				message = 'Invalid input';
			}
			break;
		case ZcIssueCode.custom:
			message = `Invalid input`;
			break;
		case ZcIssueCode.invalid_intersection_types:
			message = `Intersection results could not be merged`;
			break;
		case ZcIssueCode.not_multiple_of:
			message = `Number must be a multiple of ${issue.multipleOf}`;
			break;
		case ZcIssueCode.not_finite:
			message = 'Number must be finite';
			break;
		default:
			message = _ctx.defaultError;
			assertNever(issue);
	}
	return { message };
};
export default errorMap;
