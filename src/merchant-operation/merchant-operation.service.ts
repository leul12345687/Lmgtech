import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import { Booking, BookingDocument } from '../booking/booking.schema';
import { Asset, AssetDocument } from '../property/property.schema';
import { User, UserDocument } from '../schema/user.schema';
import { BookingStatus } from '../booking/booking.schema';

@Injectable()
export class MerchantOperationService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Asset.name)
    private readonly assetModel: Model<AssetDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly i18n: I18nService,
  ) {}

  // ===================================================
  // 1️⃣ Get all bookings for this merchant
  // ===================================================
  async getMerchantBookings(merchantId: Types.ObjectId, lang: string) {
    try {
      const bookings = await this.bookingModel
        .find({ merchant: merchantId })
        .populate('asset', 'name category priceUnit')
        .populate('customer', 'fullName email phonenumber')
        .lean();

      if (!bookings.length) {
        throw new NotFoundException(
          await this.i18n.translate('merchant-operation.ERROR_NO_BOOKINGS_FOUND', { lang }),
        );
      }

      return {
        message: await this.i18n.translate('merchant-operation.SUCCESS_BOOKINGS_FETCHED', { lang }),
        totalBookings: bookings.length,
        bookings: bookings.map((b) => ({
          bookingId: b._id,
          propertyName: (b.asset as any)?.name,
          customerName: (b.customer as any)?.fullName,
          customerEmail: (b.customer as any)?.email,
          customerPhone: (b.customer as any)?.phonenumber,
          startDate: b.startDate,
          endDate: b.endDate,
          totalPrice: b.totalPrice,
          status: b.status,
          numberOfProperty: b.numberOfProperty
        })),
      };
    } catch (error) {
      console.error('❌ Error fetching merchant bookings:', error);
      throw new InternalServerErrorException('Failed to fetch bookings.');
    }
  }
  async getMerchantProperties(merchantId: Types.ObjectId, lang: string) {
  console.log('--- START getMerchantProperties Execution ---');
  console.log(`Input Parameters: merchantId=${merchantId}, lang=${lang}`);

  try {
    // 1️⃣ Get all properties owned by this merchant
    console.log(`1. Querying Asset Model for properties owned by merchant: ${merchantId}`);
    const properties = await this.assetModel
      .find({ merchant: merchantId })
      .lean();

    console.log(`   Result: Found ${properties.length} properties.`);

    if (!properties.length) {
      console.log('   Condition: No properties found. Throwing NotFoundException.');
      throw new NotFoundException(
        await this.i18n.translate('merchant-operation.ERROR_NO_PROPERTY_FOUND', { lang }),
      );
    }

    // 2️⃣ Get all bookings related to these properties
    const propertyIds = properties.map((p) => p._id);
    console.log(`2. Extracted Property IDs for booking query: ${propertyIds.join(', ')}`);

    const bookings = await this.bookingModel
      .find({ asset: { $in: propertyIds } })
      .select('asset startDate endDate numberOfProperty') // Note: 'booking' field was likely a typo in original code, changed to 'asset'
      .lean();

    console.log(`   Result: Found ${bookings.length} bookings related to these properties.`);
    // console.log('   Booking Data Sample (first 2):', bookings.slice(0, 2)); // Uncomment for large data sets

    // 3️⃣ Group bookings by property
    console.log('3. Grouping bookings by property ID...');
    const bookingMap = bookings.reduce((acc, booking) => {
      const propertyId = booking.asset.toString();
      
      // LOG: Check if propertyId conversion is working
      if (!acc[propertyId]) {
        acc[propertyId] = [];
        console.log(`   -> Initializing array for propertyId: ${propertyId}`);
      }

      acc[propertyId].push({
        startDate: booking.startDate,
        endDate: booking.endDate,
        numberOfProperty: booking.numberOfProperty,
      });
      return acc;
    }, {} as Record<string, any[]>);

    console.log(`   Result: Booking Map keys (Property IDs with bookings): ${Object.keys(bookingMap).join(', ')}`);

    // 4️⃣ Merge property info with its related booking data
    console.log('4. Merging property data with grouped bookings...');
    const merged = properties.map((p) => {
      const propertyIdString = p._id.toString();
      const associatedBookings = bookingMap[propertyIdString] || [];
      
      console.log(`   -> Processing property ID ${propertyIdString}. Found ${associatedBookings.length} bookings.`);

      return {
        id: p._id,
        name: p.name,
        category: p.category,
        description: p.description,
        numberOfProperty: p.numberOfProperty,
        rentalPrice: {
          perHour: p.rentalPriceperhour,
          perDay: p.rentalPriceperday,
          perWeek: p.rentalPriceperweek,
          perMonth: p.rentalPricepermonth,
          perYear: p.rentalPriceperyear,
        },
        imageUrls: p.imageUrls,
        status: p.status,
        bookings: associatedBookings,
      };
    });

    // 5️⃣ Return response
    console.log('5. Preparing final successful response.');
    return {
      message: await this.i18n.translate('merchant-operation.SUCCESS_PROPERTY_FETCHED', { lang }),
      total: merged.length,
      properties: merged,
    };
  } catch (error) {
    // ERROR HANDLING BLOCK
    console.log('--- ERROR BLOCK ---');
    console.error('❌ Caught error in getMerchantProperties:', error);

    if (error instanceof NotFoundException) {
      console.log('   Error Type: NotFoundException. Re-throwing.');
      throw error;
    }

    // Log the failing query or operation if possible
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      console.error('   Database Error Details:', error.message);
    }
    
    // Default to InternalServerErrorException
    throw new InternalServerErrorException('Failed to fetch properties with bookings.');
  } finally {
    console.log('--- END getMerchantProperties Execution ---');
  }
}
  // ===================================================
  // 3️⃣ Update property
  // ===================================================
  async updateProperty(merchantId: Types.ObjectId, propertyId: string, updateData: any, lang: string) {
    const property = await this.assetModel.findOneAndUpdate(
      { _id: propertyId, merchant: merchantId },
      updateData,
      { new: true },
    );

    if (!property) {
      throw new NotFoundException(
        await this.i18n.translate('merchant-operation.ERROR_PROPERTY_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('merchant-operation.SUCCESS_PROPERTY_UPDATED', { lang }),
      property,
    };
  }

  // ===================================================
  // 4️⃣ Delete property
  // ===================================================
  async deleteProperty(merchantId: Types.ObjectId, propertyId: string, lang: string) {
    const deleted = await this.assetModel.findOneAndDelete({
      _id: propertyId,
      merchant: merchantId,
    });

    if (!deleted) {
      throw new NotFoundException(
        await this.i18n.translate('merchant-operation.ERROR_PROPERTY_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('merchant-operation.SUCCESS_PROPERTY_DELETED', { lang }),
    };
  }

  // ===================================================
  // 5️⃣ Update booking status (confirm, cancel, complete)
  // ===================================================
  async updateBookingStatus(merchantId: Types.ObjectId, bookingId: string, status: BookingStatus, lang: string) {
    const booking = await this.bookingModel.findOneAndUpdate(
      { _id: bookingId, merchant: merchantId },
      { status },
      { new: true },
    );

    if (!booking) {
      throw new NotFoundException(
        await this.i18n.translate('merchant-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('merchant-operation.SUCCESS_BOOKING_UPDATED', { lang }),
      booking,
    };
  }

  // ===================================================
  // 6️⃣ Delete booking
  // ===================================================
  async deleteBooking(merchantId: Types.ObjectId, bookingId: string, lang: string) {
    const deleted = await this.bookingModel.findOneAndDelete({
      _id: bookingId,
      merchant: merchantId,
    });

    if (!deleted) {
      throw new NotFoundException(
        await this.i18n.translate('merchant-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('merchant-operation.SUCCESS_BOOKING_DELETED', { lang }),
    };
  }
}

